# 🌟 TribesHub - Social Platform for Communities

TribesHub is a comprehensive social platform that brings people together through communities, events, and real-time messaging. Built with modern web technologies, it features gamification, admin controls, and seamless real-time interactions.

## ✨ Features

### 🔐 **Authentication System**
- **Modern Login & Registration** with comprehensive validation
- **Email & Phone OTP Verification** via SendGrid and Twilio
- **Forgot Password** functionality with OTP verification
- **Change Password** with OTP security
- **JWT-based Sessions** with automatic token refresh
- **Username uniqueness** checking in real-time

### 👤 **Profile Management**
- **Profile Picture Upload** with Cloudinary integration
- **Bio, Interests, and Location** management
- **Country → State → City** location selection
- **Public Profile Views** with social stats

### 🎯 **Gamification System**
- **Tribe Points** earned through daily snap streaks
- **Level System** with icons:
  - 1-60 points: ☮️ Peace
  - 61-180 points: ❤️ Love
  - 181+ points: 😊 Joy
- **Streak Reset** if snap missed for 24 hours
- **Real-time Points Updates** across the platform

### 📱 **User Dashboard**
- **Personal Profile** section with stats
- **Points Overview** with level progression
- **Events Board** showing created and joined events
- **Communities List** with membership roles
- **Activity Statistics** and achievements

### 🎉 **Events Management**
- **Create Events** with title, description, date, time, location, and images
- **Join/Leave Events** with real-time participant updates
- **Event Discovery** with filtering options
- **Participant Management** with detailed lists
- **Real-time Updates** via Socket.io

### 🏘️ **Communities**
- **Create Communities** with descriptions and images
- **Join/Search Communities** with real-time member counts
- **Member Management** with roles (admin, moderator, member)
- **Community Chat** integration
- **Community Discovery** with search functionality

### 💬 **Real-time Chat System**
- **One-to-One Messaging** with typing indicators
- **Community Group Chats** for all members
- **Snap-like Image Sharing** with Cloudinary
- **Points Integration** for snap streaks
- **Message History** with pagination
- **Online Status** indicators

### 🛡️ **Admin Dashboard**
- **Complete User Management** with detailed profiles
- **System Analytics** with charts and graphs
- **Activity Monitoring** with comprehensive logs
- **Content Moderation** tools
- **User Suspension/Ban** capabilities
- **System Health** monitoring

## 🚀 Tech Stack

### **Backend**
- **Node.js** with Express.js framework
- **PostgreSQL** database with complex relationships
- **Socket.io** for real-time communication
- **JWT** for secure authentication
- **Cloudinary** for image management
- **SendGrid** for email services
- **Twilio** for SMS services
- **bcryptjs** for password hashing

### **Frontend**
- **React** with TypeScript
- **Tailwind CSS** for modern styling
- **React Router** for navigation
- **Socket.io Client** for real-time features
- **Axios** for API communication
- **React Hook Form** for form management
- **React Hot Toast** for notifications
- **Heroicons** for UI icons

## 📁 Project Structure

```
tribeshub/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── eventController.js
│   │   ├── communityController.js
│   │   ├── chatController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   └── auth.js
│   ├── models/ (database schemas)
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── events.js
│   │   ├── communities.js
│   │   ├── chat.js
│   │   └── admin.js
│   ├── utils/
│   │   ├── otpService.js
│   │   ├── cloudinary.js
│   │   └── activityLogger.js
│   ├── scripts/
│   │   └── initDb.js
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── types/
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── tailwind.config.js
├── package.json
└── README.md
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- npm or yarn package manager

### 1. Clone the Repository
```bash
git clone <repository-url>
cd tribeshub
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend and frontend dependencies
npm run install-deps
```

### 3. Environment Configuration
```bash
# Copy environment template
cp backend/.env.example backend/.env
```

Fill in your environment variables in `backend/.env`:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/tribeshub
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tribeshub
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# SendGrid Configuration
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@tribeshub.com

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Admin Credentials
ADMIN_EMAIL=avscreation37@gmail.com
ADMIN_PASSWORD=Kalyan@111

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### 4. Database Setup
```bash
# Create PostgreSQL database
createdb tribeshub

# Initialize database tables
cd backend
npm run init-db
```

### 5. Start Development Servers
```bash
# Start both frontend and backend
npm run dev

# Or start individually:
# Backend only: npm run server
# Frontend only: npm run client
```

## 📊 Database Schema

### Core Tables
- **users**: User profiles, authentication, and gamification data
- **events**: Event information with date/time and location
- **event_participants**: Many-to-many relationship for event attendance
- **communities**: Community information and metadata
- **community_members**: Community membership with roles
- **chat_messages**: Real-time messaging with image support
- **otps**: OTP verification codes with expiration
- **activity_logs**: System activity tracking for admin dashboard

## 🎮 Admin Dashboard

Access the admin dashboard with:
- **Email**: `avscreation37@gmail.com`
- **Password**: `Kalyan@111`

### Admin Features
- **User Management**: View, suspend, delete users
- **Content Moderation**: Manage communities and events
- **Analytics Dashboard**: Real-time system statistics
- **Activity Monitoring**: Comprehensive logging system
- **System Health**: Performance and usage metrics

## 🚀 Deployment

### Backend Deployment (Render/Railway)
1. Create a new web service
2. Connect your repository
3. Set environment variables
4. Deploy with build command: `cd backend && npm install`
5. Start command: `node server.js`

### Frontend Deployment (Vercel/Netlify)
1. Connect your repository
2. Set build directory to `frontend`
3. Build command: `npm run build`
4. Publish directory: `build`

### Database (Supabase/Railway)
1. Create PostgreSQL database
2. Copy connection string to `DATABASE_URL`
3. Run database initialization script

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - OTP verification
- `POST /api/auth/forgot-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/points` - Update tribe points
- `GET /api/users/dashboard` - Get dashboard data

### Events
- `GET /api/events` - List events
- `POST /api/events` - Create event
- `POST /api/events/:id/join` - Join event
- `GET /api/events/user/my-events` - User's events

### Communities
- `GET /api/communities` - List communities
- `POST /api/communities` - Create community
- `POST /api/communities/:id/join` - Join community
- `GET /api/communities/user/my-communities` - User's communities

### Chat
- `POST /api/chat/send` - Send message
- `GET /api/chat/conversations` - Get conversations
- `GET /api/chat/direct/:user_id` - Direct messages
- `GET /api/chat/community/:community_id` - Community messages

## 🔌 Real-time Features

### Socket.io Events
- **Connection Management**: User online/offline status
- **Typing Indicators**: Real-time typing notifications
- **Message Broadcasting**: Instant message delivery
- **Event Updates**: Real-time participant changes
- **Points Updates**: Live gamification updates

## 🎨 UI/UX Features

- **Responsive Design**: Mobile-first approach
- **Modern Interface**: Clean, intuitive design
- **Real-time Updates**: Instant feedback and notifications
- **Loading States**: Smooth user experience
- **Error Handling**: Graceful error management
- **Accessibility**: WCAG compliance considerations

## 🔒 Security Features

- **JWT Authentication** with secure token handling
- **Password Hashing** with bcryptjs
- **Rate Limiting** to prevent abuse
- **Input Validation** on all endpoints
- **CORS Configuration** for secure cross-origin requests
- **SQL Injection Protection** with parameterized queries

## 📈 Performance

- **Database Indexing** for optimized queries
- **Image Optimization** with Cloudinary
- **Lazy Loading** for better performance
- **Caching Strategies** for frequently accessed data
- **Connection Pooling** for database efficiency

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact: avscreation37@gmail.com

## 🙏 Acknowledgments

- React community for excellent tools and libraries
- Tailwind CSS for the amazing styling framework
- Socket.io for real-time communication capabilities
- PostgreSQL for robust database functionality

---

**Built with ❤️ for bringing communities together**