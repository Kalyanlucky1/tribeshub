const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/events');
const communityRoutes = require('./routes/communities');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

// Import utilities
const { authenticateToken } = require('./middleware/auth');
const { calculatePointsInfo } = require('./controllers/userController');
const pool = require('./config/database');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
    },
  },
}));

app.use(compression());
app.use(morgan('combined'));

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await pool.query(
      'SELECT id, name, username, profile_pic, points, is_suspended FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || result.rows[0].is_suspended) {
      return next(new Error('User not found or suspended'));
    }

    const user = result.rows[0];
    user.points_info = calculatePointsInfo(user.points);
    
    socket.userId = user.id;
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection handling
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 User ${socket.user.username} connected (${socket.userId})`);
  
  // Store user connection
  connectedUsers.set(socket.userId, {
    socketId: socket.id,
    user: socket.user,
    lastSeen: new Date()
  });

  // Join user to their personal room for direct messages
  socket.join(`user:${socket.userId}`);

  // Join user to all their community rooms
  const joinUserCommunities = async () => {
    try {
      const communitiesResult = await pool.query(
        'SELECT community_id FROM community_members WHERE user_id = $1',
        [socket.userId]
      );
      
      communitiesResult.rows.forEach(row => {
        socket.join(`community:${row.community_id}`);
      });
    } catch (error) {
      console.error('Error joining user communities:', error);
    }
  };
  
  joinUserCommunities();

  // Handle typing indicators
  socket.on('typing:start', (data) => {
    if (data.type === 'direct' && data.receiverId) {
      socket.to(`user:${data.receiverId}`).emit('typing:start', {
        userId: socket.userId,
        user: socket.user
      });
    } else if (data.type === 'community' && data.communityId) {
      socket.to(`community:${data.communityId}`).emit('typing:start', {
        userId: socket.userId,
        user: socket.user
      });
    }
  });

  socket.on('typing:stop', (data) => {
    if (data.type === 'direct' && data.receiverId) {
      socket.to(`user:${data.receiverId}`).emit('typing:stop', {
        userId: socket.userId
      });
    } else if (data.type === 'community' && data.communityId) {
      socket.to(`community:${data.communityId}`).emit('typing:stop', {
        userId: socket.userId
      });
    }
  });

  // Handle new messages
  socket.on('message:send', async (data) => {
    try {
      const { receiverId, communityId, message, messageType = 'text', isSnap = false } = data;
      
      // Save message to database
      const messageResult = await pool.query(
        `INSERT INTO chat_messages 
         (sender_id, receiver_id, community_id, message, message_type, is_snap)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [socket.userId, receiverId || null, communityId || null, message, messageType, isSnap]
      );

      const savedMessage = messageResult.rows[0];
      savedMessage.sender = socket.user;

      // Emit to appropriate rooms
      if (receiverId) {
        // Direct message
        socket.to(`user:${receiverId}`).emit('message:new', savedMessage);
        socket.emit('message:sent', savedMessage);
      } else if (communityId) {
        // Community message
        socket.to(`community:${communityId}`).emit('message:new', savedMessage);
        socket.emit('message:sent', savedMessage);
      }

      // Log activity
      const { logChatMessage } = require('./utils/activityLogger');
      await logChatMessage(socket.userId, savedMessage);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message:error', { error: 'Failed to send message' });
    }
  });

  // Handle joining/leaving communities
  socket.on('community:join', (communityId) => {
    socket.join(`community:${communityId}`);
    console.log(`User ${socket.user.username} joined community ${communityId}`);
  });

  socket.on('community:leave', (communityId) => {
    socket.leave(`community:${communityId}`);
    console.log(`User ${socket.user.username} left community ${communityId}`);
  });

  // Handle real-time event updates
  socket.on('event:join', (eventData) => {
    socket.broadcast.emit('event:updated', {
      type: 'join',
      eventId: eventData.eventId,
      participantCount: eventData.participantCount,
      user: socket.user
    });
  });

  socket.on('event:leave', (eventData) => {
    socket.broadcast.emit('event:updated', {
      type: 'leave',
      eventId: eventData.eventId,
      participantCount: eventData.participantCount,
      user: socket.user
    });
  });

  // Handle points updates
  socket.on('points:updated', (pointsData) => {
    socket.broadcast.emit('user:points_updated', {
      userId: socket.userId,
      points: pointsData.points,
      pointsInfo: pointsData.pointsInfo
    });
  });

  // Handle user status
  socket.on('user:online', () => {
    connectedUsers.set(socket.userId, {
      ...connectedUsers.get(socket.userId),
      lastSeen: new Date(),
      isOnline: true
    });
    
    socket.broadcast.emit('user:status', {
      userId: socket.userId,
      isOnline: true,
      lastSeen: new Date()
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User ${socket.user.username} disconnected (${socket.userId})`);
    
    // Update user status
    const userConnection = connectedUsers.get(socket.userId);
    if (userConnection) {
      connectedUsers.set(socket.userId, {
        ...userConnection,
        isOnline: false,
        lastSeen: new Date()
      });
    }

    socket.broadcast.emit('user:status', {
      userId: socket.userId,
      isOnline: false,
      lastSeen: new Date()
    });

    // Remove from connected users after 5 minutes
    setTimeout(() => {
      connectedUsers.delete(socket.userId);
    }, 5 * 60 * 1000);
  });
});

// API endpoint to get online users
app.get('/api/users/online', authenticateToken, (req, res) => {
  const onlineUsers = Array.from(connectedUsers.values())
    .filter(connection => connection.isOnline)
    .map(connection => ({
      ...connection.user,
      lastSeen: connection.lastSeen
    }));
  
  res.json({ onlineUsers });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    pool.end(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
🚀 TribesHub Server running on port ${PORT}
📁 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
📊 Admin Email: ${process.env.ADMIN_EMAIL || 'avscreation37@gmail.com'}
  `);
});

module.exports = { app, server, io };