const pool = require('../config/database');
const { uploadEventImage } = require('../utils/cloudinary');
const { logEventCreated, logEventJoined } = require('../utils/activityLogger');

// Create new event
const createEvent = async (req, res) => {
  try {
    const { title, description, event_date, event_time, location } = req.body;
    const userId = req.user.id;

    if (!title || !event_date || !event_time) {
      return res.status(400).json({ error: 'Title, date, and time are required' });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadEventImage(req.file.buffer);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Event image upload error:', uploadError);
      }
    }

    // Create event
    const result = await pool.query(
      `INSERT INTO events (title, description, event_date, event_time, location, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, description, event_date, event_time, location, imageUrl, userId]
    );

    const event = result.rows[0];

    // Get creator details
    const creatorResult = await pool.query(
      'SELECT name, username, profile_pic FROM users WHERE id = $1',
      [userId]
    );
    
    event.creator = creatorResult.rows[0];
    event.participant_count = 0;
    event.is_joined = false;

    // Log activity
    await logEventCreated(userId, event);

    res.status(201).json({
      message: 'Event created successfully',
      event
    });

  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
};

// Get all events (upcoming and recent)
const getEvents = async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'upcoming' } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user?.id;

    let dateCondition = '';
    if (filter === 'upcoming') {
      dateCondition = 'WHERE e.event_date >= CURRENT_DATE';
    } else if (filter === 'past') {
      dateCondition = 'WHERE e.event_date < CURRENT_DATE';
    }

    const query = `
      SELECT 
        e.*,
        u.name as creator_name,
        u.username as creator_username,
        u.profile_pic as creator_profile_pic,
        COUNT(ep.user_id) as participant_count,
        ${userId ? `CASE WHEN ep_user.user_id IS NOT NULL THEN true ELSE false END as is_joined` : 'false as is_joined'}
      FROM events e
      JOIN users u ON e.created_by = u.id
      LEFT JOIN event_participants ep ON e.id = ep.event_id
      ${userId ? 'LEFT JOIN event_participants ep_user ON e.id = ep_user.event_id AND ep_user.user_id = $3' : ''}
      ${dateCondition}
      GROUP BY e.id, u.name, u.username, u.profile_pic${userId ? ', ep_user.user_id' : ''}
      ORDER BY e.event_date ASC, e.event_time ASC
      LIMIT $1 OFFSET $2
    `;

    const params = userId ? [limit, offset, userId] : [limit, offset];
    const result = await pool.query(query, params);

    const events = result.rows.map(event => ({
      ...event,
      creator: {
        name: event.creator_name,
        username: event.creator_username,
        profile_pic: event.creator_profile_pic
      }
    }));

    // Remove redundant fields
    events.forEach(event => {
      delete event.creator_name;
      delete event.creator_username;
      delete event.creator_profile_pic;
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
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
};

// Get single event details
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const eventResult = await pool.query(`
      SELECT 
        e.*,
        u.name as creator_name,
        u.username as creator_username,
        u.profile_pic as creator_profile_pic,
        COUNT(ep.user_id) as participant_count,
        ${userId ? `CASE WHEN ep_user.user_id IS NOT NULL THEN true ELSE false END as is_joined` : 'false as is_joined'}
      FROM events e
      JOIN users u ON e.created_by = u.id
      LEFT JOIN event_participants ep ON e.id = ep.event_id
      ${userId ? 'LEFT JOIN event_participants ep_user ON e.id = ep_user.event_id AND ep_user.user_id = $2' : ''}
      WHERE e.id = $1
      GROUP BY e.id, u.name, u.username, u.profile_pic${userId ? ', ep_user.user_id' : ''}
    `, userId ? [id, userId] : [id]);

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];
    event.creator = {
      name: event.creator_name,
      username: event.creator_username,
      profile_pic: event.creator_profile_pic
    };

    // Remove redundant fields
    delete event.creator_name;
    delete event.creator_username;
    delete event.creator_profile_pic;

    // Get participants
    const participantsResult = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.username,
        u.profile_pic,
        ep.joined_at
      FROM event_participants ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = $1
      ORDER BY ep.joined_at ASC
    `, [id]);

    event.participants = participantsResult.rows;

    res.json({ event });

  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
};

// Join event
const joinEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if event exists
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Check if user is already a participant
    const existingParticipant = await pool.query(
      'SELECT id FROM event_participants WHERE event_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingParticipant.rows.length > 0) {
      return res.status(400).json({ error: 'Already joined this event' });
    }

    // Add user as participant
    await pool.query(
      'INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2)',
      [id, userId]
    );

    // Get updated participant count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM event_participants WHERE event_id = $1',
      [id]
    );

    // Log activity
    await logEventJoined(userId, event);

    res.json({
      message: 'Successfully joined the event',
      joined: true,
      participant_count: parseInt(countResult.rows[0].count)
    });

  } catch (error) {
    console.error('Join event error:', error);
    res.status(500).json({ error: 'Failed to join event' });
  }
};

// Leave event
const leaveEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user is a participant
    const participantResult = await pool.query(
      'SELECT id FROM event_participants WHERE event_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (participantResult.rows.length === 0) {
      return res.status(400).json({ error: 'Not a participant of this event' });
    }

    // Remove user from participants
    await pool.query(
      'DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2',
      [id, userId]
    );

    // Get updated participant count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM event_participants WHERE event_id = $1',
      [id]
    );

    res.json({
      message: 'Successfully left the event',
      joined: false,
      participant_count: parseInt(countResult.rows[0].count)
    });

  } catch (error) {
    console.error('Leave event error:', error);
    res.status(500).json({ error: 'Failed to leave event' });
  }
};

// Get user's events (created and joined)
const getUserEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all' } = req.query; // 'created', 'joined', or 'all'

    let createdEvents = [];
    let joinedEvents = [];

    if (type === 'created' || type === 'all') {
      const createdResult = await pool.query(`
        SELECT 
          e.*,
          COUNT(ep.user_id) as participant_count
        FROM events e
        LEFT JOIN event_participants ep ON e.id = ep.event_id
        WHERE e.created_by = $1
        GROUP BY e.id
        ORDER BY e.event_date ASC, e.event_time ASC
      `, [userId]);
      
      createdEvents = createdResult.rows;
    }

    if (type === 'joined' || type === 'all') {
      const joinedResult = await pool.query(`
        SELECT 
          e.*,
          u.name as creator_name,
          u.username as creator_username,
          u.profile_pic as creator_profile_pic,
          COUNT(ep.user_id) as participant_count,
          user_ep.joined_at
        FROM event_participants user_ep
        JOIN events e ON user_ep.event_id = e.id
        JOIN users u ON e.created_by = u.id
        LEFT JOIN event_participants ep ON e.id = ep.event_id
        WHERE user_ep.user_id = $1 AND e.event_date >= CURRENT_DATE
        GROUP BY e.id, u.name, u.username, u.profile_pic, user_ep.joined_at
        ORDER BY e.event_date ASC, e.event_time ASC
      `, [userId]);

      joinedEvents = joinedResult.rows.map(event => ({
        ...event,
        creator: {
          name: event.creator_name,
          username: event.creator_username,
          profile_pic: event.creator_profile_pic
        }
      }));

      // Remove redundant fields
      joinedEvents.forEach(event => {
        delete event.creator_name;
        delete event.creator_username;
        delete event.creator_profile_pic;
      });
    }

    res.json({
      created_events: createdEvents,
      joined_events: joinedEvents
    });

  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ error: 'Failed to get user events' });
  }
};

// Update event
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, event_date, event_time, location } = req.body;

    // Check if event exists and user is creator
    const eventResult = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND created_by = $2',
      [id, userId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    // Handle image upload
    let imageUrl = eventResult.rows[0].image_url;
    if (req.file) {
      try {
        const uploadResult = await uploadEventImage(req.file.buffer);
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Event image upload error:', uploadError);
      }
    }

    // Update event
    const updateResult = await pool.query(
      `UPDATE events 
       SET title = $1, description = $2, event_date = $3, event_time = $4, 
           location = $5, image_url = $6, updated_at = NOW()
       WHERE id = $7 AND created_by = $8
       RETURNING *`,
      [title, description, event_date, event_time, location, imageUrl, id, userId]
    );

    const updatedEvent = updateResult.rows[0];

    res.json({
      message: 'Event updated successfully',
      event: updatedEvent
    });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
};

// Delete event
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if event exists and user is creator (or admin)
    const eventResult = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND (created_by = $2 OR $3 = true)',
      [id, userId, req.user.is_admin]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    // Delete event (cascade will handle participants)
    await pool.query('DELETE FROM events WHERE id = $1', [id]);

    res.json({
      message: 'Event deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  joinEvent,
  leaveEvent,
  getUserEvents,
  updateEvent,
  deleteEvent
};