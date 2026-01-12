const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// 1. Configuración de Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 2. Configuración del Pool de Conexiones (Solución al error "closed state")
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    keepAliveInitialDelay: 10000, // Ayuda a mantener la conexión activa con Hostinger
    enableKeepAlive: true
});

// Verificación de conexión inicial
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error conectando a Hostinger:', err);
        return;
    }
    console.log('¡Conectado exitosamente a la base de datos mediante Pool!');
    connection.release();
});

// 3. RUTAS DE NAVEGACIÓN (En minúsculas como en tu GitHub)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 4. RUTA DE REGISTRO (Ajustada a tus columnas: nombres, password_hash, tipo)
app.post('/register', (req, res) => {
    const { nombre, email, password, rol } = req.body;
    
    // El query usa los nombres exactos de tu tabla 'usuarios'
    const query = 'INSERT INTO usuarios (nombres, email, password_hash, tipo) VALUES (?, ?, ?, ?)';
    
    // Convertimos el rol a MAYÚSCULAS para cumplir con el ENUM ('CONDUCTOR', 'PROPIETARIO')
    const rolMayus = rol.toUpperCase();

    db.query(query, [nombre, email, password, rolMayus], (err, result) => {
        if (err) {
            console.error('Error al insertar en Hostinger:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Usuario registrado con éxito en Hostinger' });
    });
});

// 5. RUTA DE LOGIN
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM usuarios WHERE email = ? AND password_hash = ?';
    
    db.query(query, [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});


