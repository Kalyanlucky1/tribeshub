const pool = require('../config/database');

const logActivity = async (type, userId = null, details = {}) => {
  try {
    await pool.query(
      'INSERT INTO activity_logs (type, user_id, details) VALUES ($1, $2, $3)',
      [type, userId, JSON.stringify(details)]
    );
    console.log(`📊 Activity logged: ${type} for user ${userId}`);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// Specific activity logging functions
const logUserSignup = async (userId, userDetails) => {
  await logActivity('USER_SIGNUP', userId, {
    action: 'User registered',
    userDetails: {
      email: userDetails.email,
      username: userDetails.username,
      name: userDetails.name
    }
  });
};

const logUserLogin = async (userId, loginDetails) => {
  await logActivity('USER_LOGIN', userId, {
    action: 'User logged in',
    timestamp: new Date().toISOString(),
    ...loginDetails
  });
};

const logEventCreated = async (userId, eventDetails) => {
  await logActivity('EVENT_CREATED', userId, {
    action: 'Event created',
    eventId: eventDetails.id,
    eventTitle: eventDetails.title,
    eventDate: eventDetails.event_date
  });
};

const logEventJoined = async (userId, eventDetails) => {
  await logActivity('EVENT_JOINED', userId, {
    action: 'Event joined',
    eventId: eventDetails.id,
    eventTitle: eventDetails.title
  });
};

const logCommunityCreated = async (userId, communityDetails) => {
  await logActivity('COMMUNITY_CREATED', userId, {
    action: 'Community created',
    communityId: communityDetails.id,
    communityName: communityDetails.name
  });
};

const logCommunityJoined = async (userId, communityDetails) => {
  await logActivity('COMMUNITY_JOINED', userId, {
    action: 'Community joined',
    communityId: communityDetails.id,
    communityName: communityDetails.name
  });
};

const logChatMessage = async (userId, messageDetails) => {
  await logActivity('CHAT_MESSAGE', userId, {
    action: 'Chat message sent',
    messageType: messageDetails.message_type,
    isSnap: messageDetails.is_snap,
    receiverId: messageDetails.receiver_id,
    communityId: messageDetails.community_id
  });
};

const logPointsUpdate = async (userId, pointsDetails) => {
  await logActivity('POINTS_UPDATE', userId, {
    action: 'Points updated',
    oldPoints: pointsDetails.oldPoints,
    newPoints: pointsDetails.newPoints,
    reason: pointsDetails.reason
  });
};

const logPasswordChange = async (userId) => {
  await logActivity('PASSWORD_CHANGE', userId, {
    action: 'Password changed',
    timestamp: new Date().toISOString()
  });
};

const logAdminAction = async (adminId, actionDetails) => {
  await logActivity('ADMIN_ACTION', adminId, {
    action: 'Admin action performed',
    ...actionDetails
  });
};

// Get activity logs for admin dashboard
const getActivityLogs = async (limit = 100, offset = 0, type = null) => {
  try {
    let query = `
      SELECT 
        al.*,
        u.name as user_name,
        u.username,
        u.email
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
    `;
    
    const params = [];
    if (type) {
      query += ' WHERE al.type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error getting activity logs:', error);
    throw error;
  }
};

// Get activity stats for dashboard
const getActivityStats = async (days = 7) => {
  try {
    const result = await pool.query(`
      SELECT 
        type,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM activity_logs 
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY type, DATE(created_at)
      ORDER BY date DESC, type
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Error getting activity stats:', error);
    throw error;
  }
};

module.exports = {
  logActivity,
  logUserSignup,
  logUserLogin,
  logEventCreated,
  logEventJoined,
  logCommunityCreated,
  logCommunityJoined,
  logChatMessage,
  logPointsUpdate,
  logPasswordChange,
  logAdminAction,
  getActivityLogs,
  getActivityStats
};