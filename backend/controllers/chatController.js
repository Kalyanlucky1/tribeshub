const pool = require('../config/database');
const { uploadSnapImage } = require('../utils/cloudinary');
const { logChatMessage } = require('../utils/activityLogger');
const { calculatePointsInfo } = require('./userController');

// Send message (direct or community)
const sendMessage = async (req, res) => {
  try {
    const { receiver_id, community_id, message, is_snap = false } = req.body;
    const senderId = req.user.id;

    // Validate input
    if (!receiver_id && !community_id) {
      return res.status(400).json({ error: 'Either receiver_id or community_id is required' });
    }

    if (receiver_id && community_id) {
      return res.status(400).json({ error: 'Cannot send to both user and community' });
    }

    if (!message && !req.file) {
      return res.status(400).json({ error: 'Message content or image is required' });
    }

    // Handle image upload for snaps
    let imageUrl = null;
    let messageType = 'text';

    if (req.file) {
      try {
        const uploadResult = await uploadSnapImage(req.file.buffer);
        imageUrl = uploadResult.secure_url;
        messageType = 'image';
      } catch (uploadError) {
        console.error('Snap image upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    // If sending to community, verify membership
    if (community_id) {
      const membershipResult = await pool.query(
        'SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2',
        [community_id, senderId]
      );

      if (membershipResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a member of this community' });
      }
    }

    // If sending to user, verify they exist and are not suspended
    if (receiver_id) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND is_suspended = false',
        [receiver_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
    }

    // Save message
    const messageResult = await pool.query(
      `INSERT INTO chat_messages 
       (sender_id, receiver_id, community_id, message, image_url, message_type, is_snap)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [senderId, receiver_id || null, community_id || null, message || null, imageUrl, messageType, is_snap]
    );

    const savedMessage = messageResult.rows[0];

    // Get sender details
    const senderResult = await pool.query(
      'SELECT name, username, profile_pic, points FROM users WHERE id = $1',
      [senderId]
    );

    const sender = senderResult.rows[0];
    sender.points_info = calculatePointsInfo(sender.points);

    savedMessage.sender = sender;

    // Log activity
    await logChatMessage(senderId, savedMessage);

    // Return message with sender info
    res.status(201).json({
      message: 'Message sent successfully',
      chat_message: savedMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Get direct messages between two users
const getDirectMessages = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const currentUserId = req.user.id;
    const offset = (page - 1) * limit;

    // Verify the other user exists
    const userResult = await pool.query(
      'SELECT id, name, username, profile_pic FROM users WHERE id = $1 AND is_suspended = false',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otherUser = userResult.rows[0];

    // Get messages between the two users
    const messagesResult = await pool.query(
      `SELECT 
        cm.*,
        u.name as sender_name,
        u.username as sender_username,
        u.profile_pic as sender_profile_pic,
        u.points as sender_points
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE 
         ((cm.sender_id = $1 AND cm.receiver_id = $2) OR 
          (cm.sender_id = $2 AND cm.receiver_id = $1))
         AND cm.community_id IS NULL
       ORDER BY cm.created_at DESC
       LIMIT $3 OFFSET $4`,
      [currentUserId, user_id, limit, offset]
    );

    const messages = messagesResult.rows.map(message => ({
      ...message,
      sender: {
        id: message.sender_id,
        name: message.sender_name,
        username: message.sender_username,
        profile_pic: message.sender_profile_pic,
        points_info: calculatePointsInfo(message.sender_points)
      }
    }));

    // Remove redundant fields
    messages.forEach(message => {
      delete message.sender_name;
      delete message.sender_username;
      delete message.sender_profile_pic;
      delete message.sender_points;
    });

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      other_user: otherUser,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get direct messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Get community messages
const getCommunityMessages = async (req, res) => {
  try {
    const { community_id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const offset = (page - 1) * limit;

    // Verify user is a member of the community
    const membershipResult = await pool.query(
      'SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2',
      [community_id, userId]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this community' });
    }

    // Get community info
    const communityResult = await pool.query(
      'SELECT id, name, description, image_url FROM communities WHERE id = $1',
      [community_id]
    );

    if (communityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Community not found' });
    }

    const community = communityResult.rows[0];

    // Get messages from the community
    const messagesResult = await pool.query(
      `SELECT 
        cm.*,
        u.name as sender_name,
        u.username as sender_username,
        u.profile_pic as sender_profile_pic,
        u.points as sender_points
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE cm.community_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [community_id, limit, offset]
    );

    const messages = messagesResult.rows.map(message => ({
      ...message,
      sender: {
        id: message.sender_id,
        name: message.sender_name,
        username: message.sender_username,
        profile_pic: message.sender_profile_pic,
        points_info: calculatePointsInfo(message.sender_points)
      }
    }));

    // Remove redundant fields
    messages.forEach(message => {
      delete message.sender_name;
      delete message.sender_username;
      delete message.sender_profile_pic;
      delete message.sender_points;
    });

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      community,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get community messages error:', error);
    res.status(500).json({ error: 'Failed to get community messages' });
  }
};

// Get user's recent conversations
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get recent direct conversations
    const directConversationsResult = await pool.query(
      `SELECT DISTINCT
        CASE 
          WHEN cm.sender_id = $1 THEN cm.receiver_id 
          ELSE cm.sender_id 
        END as other_user_id,
        u.name as other_user_name,
        u.username as other_user_username,
        u.profile_pic as other_user_profile_pic,
        u.points as other_user_points,
        latest.message as last_message,
        latest.message_type as last_message_type,
        latest.created_at as last_message_time,
        latest.sender_id as last_sender_id
       FROM chat_messages cm
       JOIN users u ON (
         CASE 
           WHEN cm.sender_id = $1 THEN cm.receiver_id 
           ELSE cm.sender_id 
         END
       ) = u.id
       JOIN (
         SELECT 
           CASE 
             WHEN sender_id = $1 THEN receiver_id 
             ELSE sender_id 
           END as other_id,
           message,
           message_type,
           created_at,
           sender_id,
           ROW_NUMBER() OVER (
             PARTITION BY CASE 
               WHEN sender_id = $1 THEN receiver_id 
               ELSE sender_id 
             END 
             ORDER BY created_at DESC
           ) as rn
         FROM chat_messages
         WHERE (sender_id = $1 OR receiver_id = $1) 
           AND community_id IS NULL
       ) latest ON latest.other_id = (
         CASE 
           WHEN cm.sender_id = $1 THEN cm.receiver_id 
           ELSE cm.sender_id 
         END
       ) AND latest.rn = 1
       WHERE (cm.sender_id = $1 OR cm.receiver_id = $1) 
         AND cm.community_id IS NULL
         AND u.is_suspended = false
       ORDER BY latest.created_at DESC
       LIMIT 20`,
      [userId]
    );

    // Get recent community conversations
    const communityConversationsResult = await pool.query(
      `SELECT 
        c.id as community_id,
        c.name as community_name,
        c.image_url as community_image,
        latest.message as last_message,
        latest.message_type as last_message_type,
        latest.created_at as last_message_time,
        latest.sender_id as last_sender_id,
        sender.name as last_sender_name
       FROM community_members cm
       JOIN communities c ON cm.community_id = c.id
       LEFT JOIN (
         SELECT 
           community_id,
           message,
           message_type,
           created_at,
           sender_id,
           ROW_NUMBER() OVER (PARTITION BY community_id ORDER BY created_at DESC) as rn
         FROM chat_messages
         WHERE community_id IS NOT NULL
       ) latest ON latest.community_id = c.id AND latest.rn = 1
       LEFT JOIN users sender ON latest.sender_id = sender.id
       WHERE cm.user_id = $1
       ORDER BY latest.created_at DESC NULLS LAST
       LIMIT 20`,
      [userId]
    );

    const directConversations = directConversationsResult.rows.map(conv => ({
      type: 'direct',
      other_user: {
        id: conv.other_user_id,
        name: conv.other_user_name,
        username: conv.other_user_username,
        profile_pic: conv.other_user_profile_pic,
        points_info: calculatePointsInfo(conv.other_user_points)
      },
      last_message: conv.last_message,
      last_message_type: conv.last_message_type,
      last_message_time: conv.last_message_time,
      is_own_message: conv.last_sender_id === userId
    }));

    const communityConversations = communityConversationsResult.rows.map(conv => ({
      type: 'community',
      community: {
        id: conv.community_id,
        name: conv.community_name,
        image_url: conv.community_image
      },
      last_message: conv.last_message,
      last_message_type: conv.last_message_type,
      last_message_time: conv.last_message_time,
      last_sender_name: conv.last_sender_name,
      is_own_message: conv.last_sender_id === userId
    }));

    // Combine and sort by last message time
    const allConversations = [...directConversations, ...communityConversations]
      .sort((a, b) => {
        if (!a.last_message_time) return 1;
        if (!b.last_message_time) return -1;
        return new Date(b.last_message_time) - new Date(a.last_message_time);
      });

    res.json({ conversations: allConversations });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};

// Delete message
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if message exists and user is the sender
    const messageResult = await pool.query(
      'SELECT * FROM chat_messages WHERE id = $1',
      [id]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = messageResult.rows[0];

    // Only sender or admin can delete
    if (message.sender_id !== userId && !req.user.is_admin) {
      return res.status(403).json({ error: 'Unauthorized to delete this message' });
    }

    // Delete message
    await pool.query('DELETE FROM chat_messages WHERE id = $1', [id]);

    res.json({
      message: 'Message deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Mark messages as read (for future implementation)
const markAsRead = async (req, res) => {
  try {
    const { conversation_id, type } = req.body; // type: 'direct' or 'community'
    const userId = req.user.id;

    // This is a placeholder for read receipts functionality
    // In a full implementation, you'd have a separate table for message read status

    res.json({
      message: 'Messages marked as read',
      success: true
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

module.exports = {
  sendMessage,
  getDirectMessages,
  getCommunityMessages,
  getConversations,
  deleteMessage,
  markAsRead
};