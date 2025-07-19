const pool = require('../config/database');
const { getActivityLogs, getActivityStats } = require('../utils/activityLogger');
const { calculatePointsInfo } = require('./userController');

// Get dashboard overview statistics
const getDashboardStats = async (req, res) => {
  try {
    // Get total counts
    const stats = await Promise.all([
      // Total users
      pool.query('SELECT COUNT(*) as total_users FROM users WHERE is_admin = false'),
      
      // Active users (logged in within last 30 days)
      pool.query(`
        SELECT COUNT(*) as active_users 
        FROM users 
        WHERE last_login_time > NOW() - INTERVAL '30 days' 
          AND is_admin = false
      `),
      
      // Total events
      pool.query('SELECT COUNT(*) as total_events FROM events'),
      
      // Total communities
      pool.query('SELECT COUNT(*) as total_communities FROM communities'),
      
      // Total messages
      pool.query('SELECT COUNT(*) as total_messages FROM chat_messages'),
      
      // Users with points
      pool.query('SELECT COUNT(*) as users_with_points FROM users WHERE points > 0'),
      
      // Recent signups (last 7 days)
      pool.query(`
        SELECT COUNT(*) as recent_signups 
        FROM users 
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND is_admin = false
      `),
      
      // Suspended users
      pool.query('SELECT COUNT(*) as suspended_users FROM users WHERE is_suspended = true')
    ]);

    const dashboardStats = {
      total_users: parseInt(stats[0].rows[0].total_users),
      active_users: parseInt(stats[1].rows[0].active_users),
      total_events: parseInt(stats[2].rows[0].total_events),
      total_communities: parseInt(stats[3].rows[0].total_communities),
      total_messages: parseInt(stats[4].rows[0].total_messages),
      users_with_points: parseInt(stats[5].rows[0].users_with_points),
      recent_signups: parseInt(stats[6].rows[0].recent_signups),
      suspended_users: parseInt(stats[7].rows[0].suspended_users)
    };

    res.json({ stats: dashboardStats });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
};

// Get all users with details
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['is_admin = false'];
    const params = [];

    // Search filter
    if (search) {
      whereConditions.push(`(LOWER(name) LIKE LOWER($${params.length + 1}) OR LOWER(username) LIKE LOWER($${params.length + 1}) OR LOWER(email) LIKE LOWER($${params.length + 1}))`);
      params.push(`%${search}%`);
    }

    // Status filter
    if (status === 'active') {
      whereConditions.push('is_suspended = false');
    } else if (status === 'suspended') {
      whereConditions.push('is_suspended = true');
    }

    const query = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM event_participants ep WHERE ep.user_id = u.id) as events_joined,
        (SELECT COUNT(*) FROM community_members cm WHERE cm.user_id = u.id) as communities_joined,
        (SELECT COUNT(*) FROM events e WHERE e.created_by = u.id) as events_created,
        (SELECT COUNT(*) FROM communities c WHERE c.created_by = u.id) as communities_created,
        (SELECT COUNT(*) FROM chat_messages msg WHERE msg.sender_id = u.id) as messages_sent
      FROM users u
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    const users = result.rows.map(user => ({
      ...user,
      points_info: calculatePointsInfo(user.points),
      events_joined: parseInt(user.events_joined),
      communities_joined: parseInt(user.communities_joined),
      events_created: parseInt(user.events_created),
      communities_created: parseInt(user.communities_created),
      messages_sent: parseInt(user.messages_sent)
    }));

    // Remove password hash for security
    users.forEach(user => {
      delete user.password_hash;
    });

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: users.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Get all communities with details
const getAllCommunities = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

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
        u.email as creator_email,
        (SELECT COUNT(*) FROM chat_messages cm WHERE cm.community_id = c.id) as total_messages
      FROM communities c
      JOIN users u ON c.created_by = u.id
      ${searchCondition}
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, params);

    const communities = result.rows.map(community => ({
      ...community,
      creator: {
        name: community.creator_name,
        username: community.creator_username,
        email: community.creator_email
      },
      total_messages: parseInt(community.total_messages)
    }));

    // Remove redundant fields
    communities.forEach(community => {
      delete community.creator_name;
      delete community.creator_username;
      delete community.creator_email;
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
    console.error('Get all communities error:', error);
    res.status(500).json({ error: 'Failed to get communities' });
  }
};

// Get all events with details
const getAllEvents = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', filter = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    const params = [];

    // Search filter
    if (search) {
      whereConditions.push(`(LOWER(e.title) LIKE LOWER($${params.length + 1}) OR LOWER(e.description) LIKE LOWER($${params.length + 1}))`);
      params.push(`%${search}%`);
    }

    // Date filter
    if (filter === 'upcoming') {
      whereConditions.push('e.event_date >= CURRENT_DATE');
    } else if (filter === 'past') {
      whereConditions.push('e.event_date < CURRENT_DATE');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        e.*,
        u.name as creator_name,
        u.username as creator_username,
        u.email as creator_email,
        COUNT(ep.user_id) as participant_count
      FROM events e
      JOIN users u ON e.created_by = u.id
      LEFT JOIN event_participants ep ON e.id = ep.event_id
      ${whereClause}
      GROUP BY e.id, u.name, u.username, u.email
      ORDER BY e.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    const events = result.rows.map(event => ({
      ...event,
      creator: {
        name: event.creator_name,
        username: event.creator_username,
        email: event.creator_email
      },
      participant_count: parseInt(event.participant_count)
    }));

    // Remove redundant fields
    events.forEach(event => {
      delete event.creator_name;
      delete event.creator_username;
      delete event.creator_email;
    });

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: events.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get all events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
};

// Get activity logs
const getActivityLogsEndpoint = async (req, res) => {
  try {
    const { page = 1, limit = 100, type = null } = req.query;
    const offset = (page - 1) * limit;

    const logs = await getActivityLogs(limit, offset, type);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: logs.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Failed to get activity logs' });
  }
};

// Get activity statistics
const getActivityStatsEndpoint = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const stats = await getActivityStats(days);

    // Process stats for chart display
    const processedStats = {};
    stats.forEach(stat => {
      if (!processedStats[stat.date]) {
        processedStats[stat.date] = {};
      }
      processedStats[stat.date][stat.type] = parseInt(stat.count);
    });

    res.json({ stats: processedStats });

  } catch (error) {
    console.error('Get activity stats error:', error);
    res.status(500).json({ error: 'Failed to get activity statistics' });
  }
};

// Suspend/unsuspend user
const toggleUserSuspension = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Get current user status
    const userResult = await pool.query(
      'SELECT is_suspended, name, username FROM users WHERE id = $1 AND is_admin = false',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const newStatus = !user.is_suspended;

    // Update suspension status
    await pool.query(
      'UPDATE users SET is_suspended = $1 WHERE id = $2',
      [newStatus, userId]
    );

    // Log admin action
    const { logAdminAction } = require('../utils/activityLogger');
    await logAdminAction(req.user.id, {
      action: newStatus ? 'suspend_user' : 'unsuspend_user',
      target_user_id: userId,
      target_user_name: user.name,
      target_username: user.username,
      reason: reason || 'No reason provided'
    });

    res.json({
      message: `User ${newStatus ? 'suspended' : 'unsuspended'} successfully`,
      suspended: newStatus
    });

  } catch (error) {
    console.error('Toggle user suspension error:', error);
    res.status(500).json({ error: 'Failed to update user suspension status' });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Get user details before deletion
    const userResult = await pool.query(
      'SELECT name, username, email FROM users WHERE id = $1 AND is_admin = false',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Delete user (cascade will handle related records)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    // Log admin action
    const { logAdminAction } = require('../utils/activityLogger');
    await logAdminAction(req.user.id, {
      action: 'delete_user',
      target_user_name: user.name,
      target_username: user.username,
      target_email: user.email,
      reason: reason || 'No reason provided'
    });

    res.json({
      message: 'User deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Delete community
const deleteCommunityAdmin = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { reason } = req.body;

    // Get community details before deletion
    const communityResult = await pool.query(
      'SELECT name, created_by FROM communities WHERE id = $1',
      [communityId]
    );

    if (communityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const community = communityResult.rows[0];

    // Delete community (cascade will handle related records)
    await pool.query('DELETE FROM communities WHERE id = $1', [communityId]);

    // Log admin action
    const { logAdminAction } = require('../utils/activityLogger');
    await logAdminAction(req.user.id, {
      action: 'delete_community',
      target_community_name: community.name,
      target_community_id: communityId,
      reason: reason || 'No reason provided'
    });

    res.json({
      message: 'Community deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete community error:', error);
    res.status(500).json({ error: 'Failed to delete community' });
  }
};

// Delete event
const deleteEventAdmin = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reason } = req.body;

    // Get event details before deletion
    const eventResult = await pool.query(
      'SELECT title, created_by FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Delete event (cascade will handle related records)
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

    // Log admin action
    const { logAdminAction } = require('../utils/activityLogger');
    await logAdminAction(req.user.id, {
      action: 'delete_event',
      target_event_title: event.title,
      target_event_id: eventId,
      reason: reason || 'No reason provided'
    });

    res.json({
      message: 'Event deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
};

// Get system analytics
const getSystemAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // User growth over time
    const userGrowthResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND is_admin = false
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Event participation over time
    const eventParticipationResult = await pool.query(`
      SELECT 
        DATE(ep.joined_at) as date,
        COUNT(*) as participations
      FROM event_participants ep
      WHERE ep.joined_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(ep.joined_at)
      ORDER BY date DESC
    `);

    // Community growth
    const communityGrowthResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_communities
      FROM communities 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Message activity
    const messageActivityResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as messages,
        COUNT(CASE WHEN is_snap = true THEN 1 END) as snaps
      FROM chat_messages 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Points distribution
    const pointsDistributionResult = await pool.query(`
      SELECT 
        CASE 
          WHEN points = 0 THEN '0'
          WHEN points BETWEEN 1 AND 60 THEN '1-60 (Peace ☮️)'
          WHEN points BETWEEN 61 AND 180 THEN '61-180 (Love ❤️)'
          WHEN points >= 181 THEN '181+ (Joy 😊)'
        END as points_range,
        COUNT(*) as user_count
      FROM users
      WHERE is_admin = false
      GROUP BY 
        CASE 
          WHEN points = 0 THEN '0'
          WHEN points BETWEEN 1 AND 60 THEN '1-60 (Peace ☮️)'
          WHEN points BETWEEN 61 AND 180 THEN '61-180 (Love ❤️)'
          WHEN points >= 181 THEN '181+ (Joy 😊)'
        END
      ORDER BY MIN(points)
    `);

    const analytics = {
      user_growth: userGrowthResult.rows,
      event_participation: eventParticipationResult.rows,
      community_growth: communityGrowthResult.rows,
      message_activity: messageActivityResult.rows,
      points_distribution: pointsDistributionResult.rows
    };

    res.json({ analytics });

  } catch (error) {
    console.error('Get system analytics error:', error);
    res.status(500).json({ error: 'Failed to get system analytics' });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getAllCommunities,
  getAllEvents,
  getActivityLogsEndpoint,
  getActivityStatsEndpoint,
  toggleUserSuspension,
  deleteUser,
  deleteCommunityAdmin,
  deleteEventAdmin,
  getSystemAnalytics
};