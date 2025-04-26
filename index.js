require('dotenv').config(); // .env dosyasını yükle

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB bağlantısı başarılı');
}).catch(err => {
  console.error('❌ MongoDB bağlantı hatası:', err);
});

// Kullanıcı şeması ve modeli
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// Çevrimiçi kullanıcılar
let onlineUsers = new Map();

// API: Giriş
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (user && user.password === password) {
      return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
  } catch (err) {
    console.error("Login hatası:", err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// API: Kayıt
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Kullanıcı adı zaten kullanılıyor' });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Register hatası:", err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  socket.on('join', (username) => {
    for (const [id, name] of onlineUsers.entries()) {
      if (name === username) {
        onlineUsers.delete(id);
      }
    }

    onlineUsers.set(socket.id, username);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      sender: data.sender,
      message: data.message,
      timestamp: data.timestamp,
    });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));
  });
});

// Port ve başlatma
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
