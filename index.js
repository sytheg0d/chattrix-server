const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// CORS ayarları
const corsOptions = {
  origin: 'https://chattrix-2ur3.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://chattrix-2ur3.onrender.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Kullanıcı verileri dosyası
const usersPath = path.join(__dirname, 'users.json');
const messagesPath = path.join(__dirname, 'messages.json');

const loadUsers = () => {
  if (!fs.existsSync(usersPath)) return {};
  return JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
};

const saveUsers = (data) => {
  fs.writeFileSync(usersPath, JSON.stringify(data, null, 2), 'utf-8');
};

const loadMessages = () => {
  if (!fs.existsSync(messagesPath)) return [];
  return JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
};

const saveMessages = (messages) => {
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), 'utf-8');
};

// Çevrimiçi kullanıcılar
let onlineUsers = new Map();

// API: Giriş
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (users[username] && users[username] === password) {
    return res.status(200).json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
});

// API: Kayıt
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (users[username]) {
    return res.status(409).json({ success: false, message: 'Kullanıcı zaten var' });
  }

  users[username] = password;
  saveUsers(users);

  return res.status(201).json({ success: true });
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  // Eski mesajları yeni bağlanan kullanıcıya gönder
  const oldMessages = loadMessages();
  oldMessages.forEach((msg) => {
    socket.emit('receive_message', msg);
  });

  socket.on('join', (username) => {
    for (const [id, name] of onlineUsers.entries()) {
      if (name === username) {
        onlineUsers.delete(id);
      }
    }

    onlineUsers.set(socket.id, username);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));

    // Sohbete katıldı mesajı
    const joinMessage = {
      sender: 'Sistem',
      message: `${username} sohbete katıldı.`,
      timestamp: new Date().toLocaleTimeString()
    };

    io.emit('receive_message', joinMessage);

    const currentMessages = loadMessages();
    currentMessages.push(joinMessage);
    saveMessages(currentMessages);
  });

  socket.on('send_message', (data) => {
    const newMessage = {
      sender: data.sender,
      message: data.message,
      timestamp: data.timestamp
    };

    io.emit('receive_message', newMessage);

    const currentMessages = loadMessages();
    currentMessages.push(newMessage);
    saveMessages(currentMessages);
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));

    if (username) {
      const leaveMessage = {
        sender: 'Sistem',
        message: `${username} sohbetten ayrıldı.`,
        timestamp: new Date().toLocaleTimeString()
      };

      io.emit('receive_message', leaveMessage);

      const currentMessages = loadMessages();
      currentMessages.push(leaveMessage);
      saveMessages(currentMessages);
    }
  });
});

// Sunucu başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
