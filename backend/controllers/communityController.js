const pool = require('../config/database');
const { uploadCommunityImage } = require('../utils/cloudinary');
const { logCommunityCreated, logCommunityJoined } = require('../utils/activityLogger');

// Create new community
const createCommunity = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Community name is required' });
    }

    // Check if community name already exists
    const existingCommunity = await pool.query(
      'SELECT id FROM communities WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existingCommunity.rows.length > 0) {
      return res.status(400).json({ error: 'Community name already exists' });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadCommunityImage(req.file.buffer);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Community image upload error:', uploadError);
      }
    }

    // Create community
    const result = await pool.query(
      `INSERT INTO communities (name, description, image_url, created_by, member_count)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING *`,
      [name, description, imageUrl, userId]
    );

    const community = result.rows[0];

    // Add creator as admin member
    await pool.query(
      'INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, $3)',
      [community.id, userId, 'admin']
    );

    // Get creator details
    const creatorResult = await pool.query(
      'SELECT name, username, profile_pic FROM users WHERE id = $1',
      [userId]
    );
    
    community.creator = creatorResult.rows[0];
    community.is_member = true;
    community.user_role = 'admin';

    // Log activity
    await logCommunityCreated(userId, community);

    res.status(201).json({
      message: 'Community created successfully',
      community
    });

  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({ error: 'Failed to create community' });
  }
};

// Get all communities
const getCommunities = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user?.id;

    let searchCondition = '';
    const params = [limit, offset];
    
    if (search) {
      searchCondition = 'WHERE LOWER(c.name) LIKE LOWER($3) OR LOWER(c.description) LIKE LOWER($3)';
      params.push(`%${search}%`);
    }

    const query = `
      SELECT 
        c.*,
        u.name as creator_name,
        u.username as creator_username,
        u.profile_pic as creator_profile_pic,
        ${userId ? `CASE WHEN cm_user.user_id IS NOT NULL THEN true ELSE false END as is_member,` : 'false as is_member,'}
        ${userId ? `cm_user.role as user_role` : `'none' as user_role`}
      FROM communities c
      JOIN users u ON c.created_by = u.id
      ${userId ? 'LEFT JOIN community_members cm_user ON c.id = cm_user.community_id AND cm_user.user_id = $' + (params.length + 1) : ''}
      ${searchCondition}
      ORDER BY c.member_count DESC, c.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    if (userId) {
      params.push(userId);
    }

    const result = await pool.query(query, params);

    const communities = result.rows.map(community => ({
      ...community,
      creator: {
        name: community.creator_name,
        username: community.creator_username,
        profile_pic: community.creator_profile_pic
      }
    }));

    // Remove redundant fields
    communities.forEach(community => {
      delete community.creator_name;
      delete community.creator_username;
      delete community.creator_profile_pic;
    });

    res.json({
      communities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: communities.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({ error: 'Failed to get communities' });
  }
};

// Get single community details
const getCommunityById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const communityResult = await pool.query(`
      SELECT 
        c.*,
        u.name as creator_name,
        u.username as creator_username,
        u.profile_pic as creator_profile_pic,
        ${userId ? `CASE WHEN cm_user.user_id IS NOT NULL THEN true ELSE false END as is_member,` : 'false as is_member,'}
        ${userId ? `cm_user.role as user_role` : `'none' as user_role`}
      FROM communities c
      JOIN users u ON c.created_by = u.id
      ${userId ? 'LEFT JOIN community_members cm_user ON c.id = cm_user.community_id AND cm_user.user_id = $2' : ''}
      WHERE c.id = $1
    `, userId ? [id, userId] : [id]);

    if (communityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const community = communityResult.rows[0];
    community.creator = {
      name: community.creator_name,
      username: community.creator_username,
      profile_pic: community.creator_profile_pic
    };

    // Remove redundant fields
    delete community.creator_name;
    delete community.creator_username;
    delete community.creator_profile_pic;

    // Get members
    const membersResult = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.username,
        u.profile_pic,
        u.points,
        cm.role,
        cm.joined_at
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = $1
      ORDER BY 
        CASE cm.role 
          WHEN 'admin' THEN 1 
          WHEN 'moderator' THEN 2 
          ELSE 3 
        END,
        cm.joined_at ASC
    `, [id]);

    community.members = membersResult.rows;

    res.json({ community });

  } catch (error) {
    console.error('Get community by ID error:', error);
    res.status(500).json({ error: 'Failed to get community' });
  }
};

// Join community
const joinCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if community exists
    const communityResult = await pool.query('SELECT * FROM communities WHERE id = $1', [id]);
    if (communityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const community = communityResult.rows[0];

    // Check if user is already a member
    const existingMember = await pool.query(
      'SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this community' });
    }

    // Add user as member
    await pool.query(
      'INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)',
      [id, userId]
    );

    // Update member count
    await pool.query(
      'UPDATE communities SET member_count = member_count + 1 WHERE id = $1',
      [id]
    );

    // Get updated member count
    const countResult = await pool.query(
      'SELECT member_count FROM communities WHERE id = $1',
      [id]
    );

    // Log activity
    await logCommunityJoined(userId, community);

    res.json({
      message: 'Successfully joined the community',
      joined: true,
      member_count: parseInt(countResult.rows[0].member_count)
    });

  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({ error: 'Failed to join community' });
  }
};

// Leave community
const leaveCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user is a member
    const memberResult = await pool.query(
      'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(400).json({ error: 'Not a member of this community' });
    }

    const member = memberResult.rows[0];

    // Check if user is the creator/admin - they can't leave unless they transfer ownership
    const communityResult = await pool.query('SELECT created_by FROM communities WHERE id = $1', [id]);
    const community = communityResult.rows[0];

    if (community.created_by === userId) {
      return res.status(400).json({ 
        error: 'Community creator cannot leave. Please transfer ownership first.' 
      });
    }

    // Remove user from members
    await pool.query(
      'DELETE FROM community_members WHERE community_id = $1 AND user_id = $2',
      [id, userId]
    );

    // Update member count
    await pool.query(
      'UPDATE communities SET member_count = member_count - 1 WHERE id = $1',
      [id]
    );

    // Get updated member count
    const countResult = await pool.query(
      'SELECT member_count FROM communities WHERE id = $1',
      [id]
    );

    res.json({
      message: 'Successfully left the community',
      joined: false,
      member_count: parseInt(countResult.rows[0].member_count)
    });

  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({ error: 'Failed to leave community' });
  }
};

// Get user's communities
const getUserCommunities = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT 
        c.*,
        u.name as creator_name,
        u.username as creator_username,
        u.profile_pic as creator_profile_pic,
        cm.role as user_role,
        cm.joined_at
      FROM community_members cm
      JOIN communities c ON cm.community_id = c.id
      JOIN users u ON c.created_by = u.id
      WHERE cm.user_id = $1
      ORDER BY 
        CASE cm.role 
          WHEN 'admin' THEN 1 
          WHEN 'moderator' THEN 2 
          ELSE 3 
        END,
        cm.joined_at ASC
    `, [userId]);

    const communities = result.rows.map(community => ({
      ...community,
      creator: {
        name: community.creator_name,
        username: community.creator_username,
        profile_pic: community.creator_profile_pic
      },
      is_member: true
    }));

    // Remove redundant fields
    communities.forEach(community => {
      delete community.creator_name;
      delete community.creator_username;
      delete community.creator_profile_pic;
    });

    res.json({ communities });

  } catch (error) {
    console.error('Get user communities error:', error);
    res.status(500).json({ error: 'Failed to get user communities' });
  }
};

// Update community
const updateCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, description } = req.body;

    // Check if user has admin rights
    const memberResult = await pool.query(
      'SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (memberResult.rows.length === 0 || 
        (memberResult.rows[0].role !== 'admin' && !req.user.is_admin)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Check if new name conflicts with existing community
    if (name) {
      const existingCommunity = await pool.query(
        'SELECT id FROM communities WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, id]
      );

      if (existingCommunity.rows.length > 0) {
        return res.status(400).json({ error: 'Community name already exists' });
      }
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadCommunityImage(req.file.buffer);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Community image upload error:', uploadError);
      }
    }

    // Build update query
    let updateFields = [];
    let params = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      params.push(description);
      paramCount++;
    }

    if (imageUrl) {
      updateFields.push(`image_url = $${paramCount}`);
      params.push(imageUrl);
      paramCount++;
    }

    updateFields.push('updated_at = NOW()');
    params.push(id);

    const updateQuery = `
      UPDATE communities 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, params);
    const updatedCommunity = updateResult.rows[0];

    res.json({
      message: 'Community updated successfully',
      community: updatedCommunity
    });

  } catch (error) {
    console.error('Update community error:', error);
    res.status(500).json({ error: 'Failed to update community' });
  }
};

// Delete community
const deleteCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user is creator or admin
    const communityResult = await pool.query(
      'SELECT * FROM communities WHERE id = $1 AND (created_by = $2 OR $3 = true)',
      [id, userId, req.user.is_admin]
    );

    if (communityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found or unauthorized' });
    }

    // Delete community (cascade will handle members and messages)
    await pool.query('DELETE FROM communities WHERE id = $1', [id]);

    res.json({
      message: 'Community deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete community error:', error);
    res.status(500).json({ error: 'Failed to delete community' });
  }
};

module.exports = {
  createCommunity,
  getCommunities,
  getCommunityById,
  joinCommunity,
  leaveCommunity,
  getUserCommunities,
  updateCommunity,
  deleteCommunity
};