const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer configuration for handling file uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Upload image to Cloudinary
const uploadImage = async (fileBuffer, folder = 'tribeshub') => {
  try {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: folder,
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' },
            { quality: 'auto:good' },
            { format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(fileBuffer);
    });
  } catch (error) {
    throw new Error('Failed to upload image');
  }
};

// Upload profile picture
const uploadProfilePicture = async (fileBuffer) => {
  return await uploadImage(fileBuffer, 'tribeshub/profiles');
};

// Upload event image
const uploadEventImage = async (fileBuffer) => {
  return await uploadImage(fileBuffer, 'tribeshub/events');
};

// Upload community image
const uploadCommunityImage = async (fileBuffer) => {
  return await uploadImage(fileBuffer, 'tribeshub/communities');
};

// Upload snap/chat image
const uploadSnapImage = async (fileBuffer) => {
  return await uploadImage(fileBuffer, 'tribeshub/snaps');
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw new Error('Failed to delete image');
  }
};

module.exports = {
  cloudinary,
  upload,
  uploadImage,
  uploadProfilePicture,
  uploadEventImage,
  uploadCommunityImage,
  uploadSnapImage,
  deleteImage
};