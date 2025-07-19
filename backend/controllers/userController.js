const pool = require('../config/database');
const { uploadProfilePicture } = require('../utils/cloudinary');
const { logPointsUpdate } = require('../utils/activityLogger');

// Get user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        id, name, username, email, phone, bio, profile_pic, 
        interests, country, state, city, points, last_snap_time,
        email_verified, phone_verified, created_at
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Calculate tribe points level and icon
    const pointsInfo = calculatePointsInfo(user.points);
    user.points_info = pointsInfo;

    // Get user's event count
    const eventsResult = await pool.query(
      'SELECT COUNT(*) as attended_events FROM event_participants WHERE user_id = $1',
      [userId]
    );
    user.attended_events = parseInt(eventsResult.rows[0].attended_events);

    // Get user's communities count
    const communitiesResult = await pool.query(
      'SELECT COUNT(*) as joined_communities FROM community_members WHERE user_id = $1',
      [userId]
    );
    user.joined_communities = parseInt(communitiesResult.rows[0].joined_communities);

    res.json({ user });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

// Get user by username (public profile)
const getUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `SELECT 
        id, name, username, bio, profile_pic, 
        interests, country, state, city, points, created_at
       FROM users 
       WHERE username = $1 AND is_suspended = false`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Calculate tribe points level and icon
    const pointsInfo = calculatePointsInfo(user.points);
    user.points_info = pointsInfo;

    // Get user's event count
    const eventsResult = await pool.query(
      'SELECT COUNT(*) as attended_events FROM event_participants WHERE user_id = $1',
      [user.id]
    );
    user.attended_events = parseInt(eventsResult.rows[0].attended_events);

    // Get user's communities count
    const communitiesResult = await pool.query(
      'SELECT COUNT(*) as joined_communities FROM community_members WHERE user_id = $1',
      [user.id]
    );
    user.joined_communities = parseInt(communitiesResult.rows[0].joined_communities);

    res.json({ user });

  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, bio, interests, country, state, city } = req.body;

    // Handle profile picture upload
    let profilePicUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadProfilePicture(req.file.buffer);
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Profile picture upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload profile picture' });
      }
    }

    // Parse interests array
    const interestsArray = Array.isArray(interests) ? interests : 
                          (typeof interests === 'string' ? interests.split(',') : null);

    // Build update query
    let updateFields = ['updated_at = NOW()'];
    let params = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }

    if (bio !== undefined) {
      updateFields.push(`bio = $${paramCount}`);
      params.push(bio);
      paramCount++;
    }

    if (profilePicUrl) {
      updateFields.push(`profile_pic = $${paramCount}`);
      params.push(profilePicUrl);
      paramCount++;
    }

    if (interestsArray) {
      updateFields.push(`interests = $${paramCount}`);
      params.push(interestsArray);
      paramCount++;
    }

    if (country) {
      updateFields.push(`country = $${paramCount}`);
      params.push(country);
      paramCount++;
    }

    if (state) {
      updateFields.push(`state = $${paramCount}`);
      params.push(state);
      paramCount++;
    }

    if (city) {
      updateFields.push(`city = $${paramCount}`);
      params.push(city);
      paramCount++;
    }

    params.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, username, email, phone, bio, profile_pic, 
                interests, country, state, city, points, created_at
    `;

    const result = await pool.query(updateQuery, params);
    const updatedUser = result.rows[0];

    // Calculate tribe points level and icon
    const pointsInfo = calculatePointsInfo(updatedUser.points);
    updatedUser.points_info = pointsInfo;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Update user points (for snap streaks)
const updatePoints = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user data
    const userResult = await pool.query(
      'SELECT points, last_snap_time FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const now = new Date();
    const lastSnapTime = user.last_snap_time ? new Date(user.last_snap_time) : null;
    
    let newPoints = user.points;
    let resetStreak = false;

    // Check if it's been more than 24 hours since last snap
    if (lastSnapTime) {
      const hoursSinceLastSnap = (now - lastSnapTime) / (1000 * 60 * 60);
      
      if (hoursSinceLastSnap > 24) {
        // Reset streak
        newPoints = 0;
        resetStreak = true;
      } else if (hoursSinceLastSnap < 1) {
        // Too soon for another snap
        return res.status(400).json({ 
          error: 'You can only send one snap per day',
          next_snap_available: new Date(lastSnapTime.getTime() + 24 * 60 * 60 * 1000)
        });
      }
    }

    // Add point for today's snap
    newPoints += 1;

    // Update user points and last snap time
    await pool.query(
      'UPDATE users SET points = $1, last_snap_time = $2 WHERE id = $3',
      [newPoints, now, userId]
    );

    // Log activity
    await logPointsUpdate(userId, {
      oldPoints: user.points,
      newPoints: newPoints,
      reason: resetStreak ? 'snap_streak_reset_and_increment' : 'daily_snap'
    });

    const pointsInfo = calculatePointsInfo(newPoints);

    res.json({
      message: resetStreak ? 'Streak reset and new snap counted!' : 'Daily snap counted!',
      points: newPoints,
      points_info: pointsInfo,
      streak_reset: resetStreak
    });

  } catch (error) {
    console.error('Update points error:', error);
    res.status(500).json({ error: 'Failed to update points' });
  }
};

// Get user dashboard data
const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user basic info with points
    const userResult = await pool.query(
      `SELECT 
        id, name, username, email, profile_pic, points, last_snap_time
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];
    user.points_info = calculatePointsInfo(user.points);

    // Get attended events count
    const eventsCountResult = await pool.query(
      'SELECT COUNT(*) as attended_events FROM event_participants WHERE user_id = $1',
      [userId]
    );
    user.attended_events = parseInt(eventsCountResult.rows[0].attended_events);

    // Get created events
    const createdEventsResult = await pool.query(
      `SELECT 
        e.*,
        COUNT(ep.user_id) as participant_count
       FROM events e
       LEFT JOIN event_participants ep ON e.id = ep.event_id
       WHERE e.created_by = $1
       GROUP BY e.id
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get joined upcoming events
    const joinedEventsResult = await pool.query(
      `SELECT 
        e.*,
        u.name as creator_name,
        u.username as creator_username,
        COUNT(ep.user_id) as participant_count
       FROM event_participants user_ep
       JOIN events e ON user_ep.event_id = e.id
       JOIN users u ON e.created_by = u.id
       LEFT JOIN event_participants ep ON e.id = ep.event_id
       WHERE user_ep.user_id = $1 AND e.event_date >= CURRENT_DATE
       GROUP BY e.id, u.name, u.username
       ORDER BY e.event_date ASC
       LIMIT 10`,
      [userId]
    );

    // Get joined communities
    const communitiesResult = await pool.query(
      `SELECT 
        c.*,
        u.name as creator_name,
        cm.role as user_role
       FROM community_members cm
       JOIN communities c ON cm.community_id = c.id
       JOIN users u ON c.created_by = u.id
       WHERE cm.user_id = $1
       ORDER BY cm.joined_at DESC
       LIMIT 10`,
      [userId]
    );

    const dashboardData = {
      user,
      created_events: createdEventsResult.rows,
      joined_events: joinedEventsResult.rows.map(event => ({
        ...event,
        creator: {
          name: event.creator_name,
          username: event.creator_username
        }
      })),
      joined_communities: communitiesResult.rows.map(community => ({
        ...community,
        creator: {
          name: community.creator_name
        },
        is_member: true
      }))
    };

    // Clean up redundant fields
    dashboardData.joined_events.forEach(event => {
      delete event.creator_name;
      delete event.creator_username;
    });

    dashboardData.joined_communities.forEach(community => {
      delete community.creator_name;
    });

    res.json(dashboardData);

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
};

// Helper function to calculate points info
const calculatePointsInfo = (points) => {
  let level, icon;
  
  if (points >= 1 && points <= 60) {
    level = 'Peace';
    icon = '☮️';
  } else if (points >= 61 && points <= 180) {
    level = 'Love';
    icon = '❤️';
  } else if (points >= 181) {
    level = 'Joy';
    icon = '😊';
  } else {
    level = 'Starter';
    icon = '🌱';
  }

  return {
    points,
    level,
    icon,
    next_level_points: points < 61 ? 61 : (points < 181 ? 181 : null)
  };
};

// Search users
const searchUsers = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await pool.query(
      `SELECT 
        id, name, username, profile_pic, bio, points, created_at
       FROM users 
       WHERE (LOWER(name) LIKE LOWER($1) OR LOWER(username) LIKE LOWER($1))
         AND is_suspended = false
       ORDER BY 
         CASE 
           WHEN LOWER(username) = LOWER($2) THEN 1
           WHEN LOWER(username) LIKE LOWER($1) THEN 2
           WHEN LOWER(name) LIKE LOWER($1) THEN 3
           ELSE 4
         END,
         points DESC
       LIMIT $3 OFFSET $4`,
      [`%${q.trim()}%`, q.trim(), limit, offset]
    );

    const users = result.rows.map(user => ({
      ...user,
      points_info: calculatePointsInfo(user.points)
    }));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: users.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};

module.exports = {
  getProfile,
  getUserByUsername,
  updateProfile,
  updatePoints,
  getDashboard,
  searchUsers,
  calculatePointsInfo
};