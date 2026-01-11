const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// 1. Configuración de Middlewares
app.use(express.json());
// Servir archivos estáticos (CSS, Imágenes, JS del cliente)
app.use(express.static(path.join(__dirname, '/')));

// 2. Conexión a la Base de Datos (Hostinger vía Railway)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a Hostinger:', err);
        return;
    }
    console.log('¡Conectado exitosamente a la base de datos!');
});

// 3. RUTAS DE NAVEGACIÓN (Para evitar el error "Not Found")
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/Register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Register.html'));
});

app.get('/Login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Login.html'));
});

// 4. RUTA DE REGISTRO (POST)
app.post('/register', (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const query = 'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)';
    
    db.query(query, [nombre, email, password, rol], (err, result) => {
        if (err) {
            console.error('Error al insertar usuario:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Usuario registrado en Hostinger' });
    });
});

// 5. RUTA DE LOGIN (POST)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM usuarios WHERE email = ? AND password = ?';
    
    db.query(query, [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (results.length > 0) {
            // Usuario encontrado
            res.json({ success: true, user: results[0] });
        } else {
            // Credenciales incorrectas
            res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});

// 6. Lanzamiento del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de TaxiConfianza corriendo en puerto ${PORT}`);
});
