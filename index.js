// Gerekli Modüller
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');

const app = express();

// MongoDB Bağlantısı
mongoose.connect('mongodb+srv://chattrixadmin:159753456@cluster0.9pzwvk6.mongodb.net/chattrix?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB bağlantısı başarılı'))
.catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));

// MongoDB Şemalar
const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  timestamp: String
});
const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  isOnline: { type: Boolean, default: false },
  credits: { type: Number, default: 0 },
  bio: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  posts: [{ image: String, text: String }],
  currentTheme: { type: String, default: 'default' }
});
const User = mongoose.model('User', userSchema);

const logSchema = new mongoose.Schema({
  username: String,
  ip: String,
  type: String,
  timestamp: String
});
const Log = mongoose.model('Log', logSchema);

const bannedIPSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true }
});
const BannedIP = mongoose.model('BannedIP', bannedIPSchema);

// Middleware Ayarları
const corsOptions = {
  origin: 'https://chattrix-2ur3.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Multer Ayarı (Fotoğraf upload için)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Server ve Socket.IO Başlangıcı
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// Global Değişkenler
let onlineUsers = new Map();
let mutedUsers = new Map();

// Admin Paneli Girişi
const adminToken = "159753456hang0ver";

app.post('/admin-login', (req, res) => {
  const { token } = req.body;
  if (token === adminToken) {
    return res.status(200).json({ success: true, message: 'Admin paneline giriş başarılı' });
  } else {
    return res.status(403).json({ success: false, message: 'Geçersiz token' });
  }
});

// Kullanıcı Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && user.password === password) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const newLog = new Log({ username, ip, type: 'login', timestamp: new Date().toLocaleString() });
      await newLog.save();
      await User.updateOne({ username }, { isOnline: true });
      return res.status(200).json({ success: true, role: user.role, credits: user.credits, profileImage: user.profileImage });
    } else {
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
    }
  } catch (err) {
    console.error('❌ Login hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const banned = await BannedIP.findOne({ ip });
    if (banned) {
      return res.status(403).json({ success: false, message: 'Bu siteden kalıcı olarak yasaklandınız.' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Kullanıcı zaten var' });
    }
    const newUser = new User({ username, password });
    await newUser.save();
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ Register hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı Listesi
app.get('/get-users', async (req, res) => {
  try {
    const users = await User.find({});
    return res.status(200).json(users);
  } catch (err) {
    console.error('❌ Kullanıcı çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı Rol Güncelleme
app.post('/update-role', async (req, res) => {
  const { username, newRole } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false, message: 'Bu kullanıcının yetkisi değiştirilemez.' });
    }
    await User.updateOne({ username }, { role: newRole });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Rol güncelleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı Silme
app.post('/delete-user', async (req, res) => {
  const { username } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false, message: 'Bu kullanıcı silinemez.' });
    }
    await User.deleteOne({ username });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Kullanıcı silme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Logları Getirme
app.get('/logs', async (req, res) => {
  try {
    const logs = await Log.find({}).sort({ timestamp: -1 });
    return res.status(200).json(logs);
  } catch (err) {
    console.error('❌ Log çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Banlı IP'ler
app.get('/banned-ips', async (req, res) => {
  try {
    const ips = await BannedIP.find({});
    return res.status(200).json(ips);
  } catch (err) {
    console.error('❌ Banlı IP çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// IP Unban
app.post('/unban-ip', async (req, res) => {
  const { ip } = req.body;
  try {
    await BannedIP.deleteOne({ ip });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ IP kaldırma hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Profil Resmi Güncelleme
app.post('/update-profile-image', async (req, res) => {
  const { username, imageBase64 } = req.body;
  try {
    await User.updateOne({ username }, { profileImage: imageBase64 });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Profil fotoğrafı güncelleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Profil Biyografi Güncelleme
app.post('/update-bio', async (req, res) => {
  const { username, bio } = req.body;
  try {
    await User.updateOne({ username }, { bio });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Bio güncelleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Post Ekleme
app.post('/add-post', async (req, res) => {
  const { username, imageBase64, text } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }
    if (user.posts.length >= 6) {
      return res.status(400).json({ success: false, message: 'En fazla 6 post paylaşabilirsiniz.' });
    }
    user.posts.push({ image: imageBase64, text });
    await user.save();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Post ekleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Market Temaları
const availableThemes = {
  "rainbow": { price: 1000, description: "Gökyüzü geçişli RGB yazı" },
  "white": { price: 100, description: "Beyaz yazı teması" },
  "lightblue": { price: 100, description: "Açık mavi yazı teması" }
};

app.get('/market', (req, res) => {
  return res.status(200).json(availableThemes);
});

// Tema Satın Alma
app.post('/buy-theme', async (req, res) => {
  const { username, theme } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }
    const item = availableThemes[theme];
    if (!item) {
      return res.status(404).json({ success: false, message: 'Böyle bir tema yok' });
    }
    if (user.credits < item.price) {
      return res.status(400).json({ success: false, message: 'Yetersiz kredi' });
    }
    user.credits -= item.price;
    user.currentTheme = theme;
    await user.save();

    return res.status(200).json({ success: true, message: `${theme} teması satın alındı!` });
  } catch (err) {
    console.error('❌ Tema satın alma hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Fotoğraf Upload API
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Fotoğraf bulunamadı' });
    }
    const imageBase64 = req.file.buffer.toString('base64');
    const sender = req.body.sender || "Bilinmeyen";
    const timestamp = new Date().toLocaleTimeString();

    const newImageMessage = new Message({
      sender,
      message: `data:${req.file.mimetype};base64,${imageBase64}`,
      timestamp
    });

    await newImageMessage.save();
    io.emit('receive_message', {
      sender,
      message: `data:${req.file.mimetype};base64,${imageBase64}`,
      timestamp
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Fotoğraf upload hatası:', err);
    res.status(500).json({ success: false });
  }
});

// Socket.IO Bağlantısı
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  // Kullanıcı Join
  socket.on('join', async (username) => {
    const userData = await User.findOne({ username });
    if (!userData) {
      console.error('❌ Kullanıcı bulunamadı:', username);
      return;
    }
    onlineUsers.set(socket.id, { username: userData.username, role: userData.role });
    await User.updateOne({ username: userData.username }, { isOnline: true });

    const onlineList = await User.find({ isOnline: true }, 'username role');
    io.emit('update_users', onlineList);

    const oldMessages = await Message.find({});
    oldMessages.forEach((msg) => socket.emit('receive_message', msg));

    const joinMessage = new Message({
      sender: 'Sistem',
      message: `${username} sohbete katıldı.`,
      timestamp: new Date().toLocaleTimeString()
    });
    await joinMessage.save();
    io.emit('receive_message', joinMessage);
  });

  // Kullanıcı Logout
  socket.on('logout', async (username) => {
    for (const [id, user] of onlineUsers.entries()) {
      if (user.username === username) {
        onlineUsers.delete(id);
      }
    }
    await User.updateOne({ username }, { isOnline: false });

    const onlineList = await User.find({ isOnline: true }, 'username role');
    io.emit('update_users', onlineList);

    const leaveMessage = new Message({
      sender: 'Sistem',
      message: `${username} sohbetten ayrıldı.`,
      timestamp: new Date().toLocaleTimeString()
    });
    await leaveMessage.save();

    const ip = socket.handshake.address;
    const logoutLog = new Log({
      username,
      ip,
      type: 'logout',
      timestamp: new Date().toLocaleString()
    });
    await logoutLog.save();
  });

  // Kullanıcı Disconnect
  socket.on('disconnect', async () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      await User.updateOne({ username: user.username }, { isOnline: false });

      const onlineList = await User.find({ isOnline: true }, 'username role');
      io.emit('update_users', onlineList);
    }
  });

  // Kullanıcı Mesaj Gönderme
  socket.on('send_message', async (data) => {
    const senderData = await User.findOne({ username: data.sender });

    if (mutedUsers.has(data.sender)) {
      socket.emit('receive_message', {
        sender: 'Sistem',
        message: 'Susturuldunuz.',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    // Yardım Komutu
    if (data.message.startsWith('/help')) {
      socket.emit('receive_message', {
        sender: 'Sistem',
        message: `Komutlar:
  /mute @kullanıcı süre(sn) - Kullanıcıyı süreli susturur
  /unmute @kullanıcı - Susturmayı kaldırır
  /yetkiver admin/mod @kullanıcı - Yetki verir
  /yetkisil @kullanıcı - Yetkiyi siler
  /ban @kullanıcı - Kullanıcıyı IP ile yasaklar`,
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    // Yetki Verme
    if (data.message.startsWith('/yetkiver') && senderData && senderData.role === 'god') {
      const parts = data.message.split(' ');
      const newRole = parts[1]?.toLowerCase();
      const targetUsername = parts[2]?.replace('@', '');

      if (['admin', 'moderator'].includes(newRole) && targetUsername) {
        if (targetUsername.toLowerCase() === 'hang0ver') {
          socket.emit('receive_message', {
            sender: 'Sistem',
            message: `Bu kullanıcının yetkisi değiştirilemez.`,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }
        await User.updateOne({ username: targetUsername }, { role: newRole });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısına ${newRole.toUpperCase()} yetkisi verildi.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    // Yetki Silme
    if (data.message.startsWith('/yetkisil') && senderData && senderData.role === 'god') {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername) {
        if (targetUsername.toLowerCase() === 'hang0ver') {
          socket.emit('receive_message', {
            sender: 'Sistem',
            message: `Bu kullanıcının yetkisi silinemez.`,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }
        await User.updateOne({ username: targetUsername }, { role: 'user' });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısının tüm yetkileri kaldırıldı.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    // Kullanıcı Susturma
    if (data.message.startsWith('/mute') && senderData && (['god', 'admin', 'moderator'].includes(senderData.role))) {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');
      const muteDuration = parseInt(parts[2]);

      if (targetUsername) {
        mutedUsers.set(targetUsername, true);
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} ${muteDuration || 'belirsiz'} saniye susturuldu.`,
          timestamp: new Date().toLocaleTimeString()
        });

        if (!isNaN(muteDuration)) {
          setTimeout(() => {
            mutedUsers.delete(targetUsername);
            io.emit('receive_message', {
              sender: 'Sistem',
              message: `${targetUsername} kullanıcısının susturulması sona erdi.`,
              timestamp: new Date().toLocaleTimeString()
            });
          }, muteDuration * 1000);
        }
      }
      return;
    }

    // Susturma Kaldırma
    if (data.message.startsWith('/unmute') && senderData && (['god', 'admin', 'moderator'].includes(senderData.role))) {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername && mutedUsers.has(targetUsername)) {
        mutedUsers.delete(targetUsername);
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısının susturulması kaldırıldı.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    // Kullanıcı Banlama
    if (data.message.startsWith('/ban') && senderData && (['god', 'admin'].includes(senderData.role))) {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername) {
        for (const [id, user] of onlineUsers.entries()) {
          if (user.username === targetUsername) {
            const bannedIP = socket.handshake.address;
            const newBanned = new BannedIP({ ip: bannedIP });
            await newBanned.save();
            const bannedSocket = io.sockets.sockets.get(id);
            if (bannedSocket) bannedSocket.disconnect();
            io.emit('receive_message', {
              sender: 'Sistem',
              message: `${targetUsername} IP adresi ile kalıcı olarak yasaklandı.`,
              timestamp: new Date().toLocaleTimeString()
            });
            break;
          }
        }
      }
      return;
    }

    // Normal Mesaj Gönderme
    const newMessage = new Message(data);
    await newMessage.save();
    await User.updateOne({ username: data.sender }, { $inc: { credits: 1 } });
    io.emit('receive_message', data);
  });
});

// Her 100 mesajda ekstra 10 kredi hediyesi
let messageCountTracker = {};

io.on('connection', (socket) => {
  socket.on('send_message', async (data) => {
    if (data.sender && data.message && !data.message.startsWith('/')) {
      if (!messageCountTracker[data.sender]) {
        messageCountTracker[data.sender] = 0;
      }
      messageCountTracker[data.sender] += 1;

      if (messageCountTracker[data.sender] % 100 === 0) {
        await User.updateOne({ username: data.sender }, { $inc: { credits: 10 } });
        socket.emit('receive_message', {
          sender: 'Sistem',
          message: `🎉 Tebrikler! 100 mesaj gönderdin ve +10 kredi kazandın!`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  });
});

// Fotoğraf Yükleme API
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Fotoğraf bulunamadı' });
    }

    const imageBuffer = req.file.buffer;
    const imageBase64 = imageBuffer.toString('base64');
    const sender = req.body.sender || "Bilinmeyen";
    const timestamp = new Date().toLocaleTimeString();

    const newImageMessage = new Message({
      sender: sender,
      message: `data:${req.file.mimetype};base64,${imageBase64}`,
      timestamp: timestamp
    });

    await newImageMessage.save();
    io.emit('receive_message', {
      sender: sender,
      message: `data:${req.file.mimetype};base64,${imageBase64}`,
      timestamp: timestamp
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Fotoğraf yükleme hatası:', err);
    res.status(500).json({ success: false });
  }
});

// Market Verileri ve Satın Alma API (Önceden Yazılmıştı Tekrara Gerek Yok)

// Sunucu Başlatma
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
