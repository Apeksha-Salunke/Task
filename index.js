const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const sharp = require('sharp'); // Image processing library
const app = express();
const PORT = 8000;
const uploadDir = './uploads';

// Ensure the 'uploads' directory exists, create if not
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/fileUploadsDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

// Define file schema for MongoDB
const fileSchema = new mongoose.Schema({
  fieldname: String,
  originalname: String,
  encoding: String,
  mimetype: String,
  destination: String,
  filename: String,
  path: String,
  size: Number, // Compressed file size
  originalSize: Number,  // Original file size (before compression)
  compressedSize: Number,  // Compressed file size (after processing)
});

const File = mongoose.model('File', fileSchema);

// Middleware for URL-encoded form data
app.use(express.urlencoded({ extended: false }));

// Configure Multer storage with diskStorage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);  // Save files to the 'uploads' directory
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;  // Unique filename to avoid conflicts
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Upload endpoint for single file upload (profileImage)
app.post('/upload', upload.single('profileImage'), async (req, res) => {
  try {
    const fileData = req.file;  // Multer adds the file object to 'req'
    
    // Check if the file is uploaded
    if (!fileData) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Capture the original file size
    const originalSize = fileData.size;  // Size of the original uploaded file

    // Define the path for the compressed image
    const compressedImagePath = path.join(uploadDir, `compressed-${fileData.filename}`);

    // Compress the image using sharp
    await sharp(fileData.path)
      .resize(800)  // Resize image to 800px width, maintaining aspect ratio
      .jpeg({ quality: 80 })  // Compress to 80% quality
      .toFile(compressedImagePath);  // Save the compressed image to the defined path

    // Asynchronously delete the original uncompressed image to save space
    try {
      await fs.promises.unlink(fileData.path);
      console.log(`Original file ${fileData.path} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting the original file:", error);
    }

    // Capture the compressed file size
    const compressedSize = fs.statSync(compressedImagePath).size;  // Size of the compressed file

    // Create a new file object with updated information for MongoDB
    const compressedFileData = {
      ...fileData,  // Copy original file data
      path: compressedImagePath,  // Update path to the compressed image
      size: compressedSize,  // Store the size of the compressed file
      originalSize: originalSize,  // Store the size of the original file (before compression)
      compressedSize: compressedSize,  // Store the size of the compressed file (after compression)
    };

    // Save the file data to MongoDB
    const file = new File(compressedFileData);
    await file.save();

    // Respond to the client with both original and compressed sizes
    res.status(201).json({
      message: 'File uploaded, compressed, and data saved successfully',
      originalSize,  // Include the original size (before compression)
      compressedSize,  // Include the compressed size (after compression)
      file: compressedFileData,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error processing the file', error });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server started at port: ${PORT}`);
});