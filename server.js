const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Configuración para leer los datos del formulario
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Conexión usando las variables que acabas de configurar en Railway
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

// Ruta para recibir los datos del registro
app.post('/register', (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const query = 'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)';
    
    db.query(query, [nombre, email, password, rol], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Usuario registrado en Hostinger' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
