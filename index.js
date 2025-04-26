const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const usersPath = path.join(__dirname, 'users.json');
let onlineUsers = new Map();

// Yardımcı fonksiyonlar
const loadUsers = () => {
  if (!fs.existsSync(usersPath)) return {};
  return JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
};

const saveUsers = (data) => {
  fs.writeFileSync(usersPath, JSON.stringify(data, null, 2), 'utf-8');
};

// API: Giriş kontrolü
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (users[username] && users[username] === password) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ success: false, message: 'Geçersiz bilgiler' });
});

// API: Kayıt oluştur
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (users[username]) {
    console.log("Kayıt reddedildi. Kullanıcı zaten var:", username);
    return res.status(409).json({ success: false, message: 'Kullanıcı zaten var' });
  }

  users[username] = password;

  try {
    saveUsers(users);
    console.log("Kayıt edildi:", username);
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Yazılamadı:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('Bağlandı:', socket.id);

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

// 🔥 DİNAMİK PORT BURASI:
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
