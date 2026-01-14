const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 1. Pool de Conexiones
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 2. Rutas de Archivos (Todo en minúsculas para evitar "Not Found")
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// 3. API para el Dashboard
app.get('/api/conductores', (req, res) => {
    const query = 'SELECT nombres, apellidos, email, tipo FROM usuarios WHERE tipo = "CONDUCTOR"';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, conductores: results });
    });
});

// 4. Registro actualizado con nuevos campos
app.post('/register', (req, res) => {
    const { nombre, apellido, celular, email, password, rol } = req.body;
    
    // Mapeo exacto a las columnas de tu base de datos
    const query = 'INSERT INTO usuarios (nombres, apellidos, celular, email, password_hash, tipo) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(query, [nombre, apellido, celular, email, password, rol.toUpperCase()], (err) => {
        if (err) {
            console.error('Error al insertar:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true });
    });
});

// 5. Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM usuarios WHERE email = ? AND password_hash = ?';
    db.query(query, [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length > 0) res.json({ success: true, user: results[0] });
        else res.json({ success: false, message: 'Credenciales incorrectas' });
    });
});

// 6. Configuración del Puerto para Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
