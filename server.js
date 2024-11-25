const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); // Importa o arquivo do Swagger
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());

app.use(bodyParser.json());

const users = [];

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Base URL do Data Dragon
const BASE_URL = 'https://ddragon.leagueoflegends.com';

// Função para validar a senha
function validatePassword(password) {
  const regex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
  return regex.test(password);
}

// Função para validar o email
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return emailRegex.test(email);
  }
  

// Middleware para verificar o token JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token não fornecido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    req.user = user;
    next();
  });
}

// Rota para registrar um usuário
app.post('/register', async (req, res) => {
    const { name, birthDate, username, password } = req.body;
  
    if (!name || name.trim().split(' ').length < 2) {
      return res.status(400).json({ message: 'O nome deve incluir pelo menos nome e sobrenome.' });
    }
  
    if (!birthDate || isNaN(new Date(birthDate).getTime())) {
      return res.status(400).json({ message: 'Data de nascimento inválida. Use o formato YYYY-MM-DD.' });
    }
  
    if (!username || !validateEmail(username)) {
      return res.status(400).json({ message: 'O nome de usuário deve ser um email válido.' });
    }
  
    if (!validatePassword(password)) {
      return res.status(400).json({
        message: 'A senha deve ter pelo menos 8 caracteres, incluindo 1 número, 1 letra maiúscula e 1 caractere especial.',
      });
    }
  
    const userExists = users.find(u => u.username === username);
    if (userExists) {
      return res.status(409).json({ message: 'Usuário já registrado.' });
    }
  
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ name, birthDate, username, password: hashedPassword });
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
  });

// Rota para login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    if (!validateEmail(username)) {
      return res.status(400).json({ message: 'O nome de usuário deve ser um email válido.' });
    }
  
    const user = users.find(u => u.username === username);
  
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }
  
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  });

// Função para obter a versão mais recente do Data Dragon
async function getLatestVersion() {
  try {
    const response = await axios.get(`${BASE_URL}/api/versions.json`);
    return response.data[0]; // Última versão
  } catch (error) {
    console.log(error);
    throw new Error('Erro ao buscar a versão mais recente');
  }
}

// Endpoint para listar campeões (autenticado)
app.get('/champions', authenticateToken, async (req, res) => {

    const lang = req.query.lang || 'pt_BR';
    try {
      const version = await getLatestVersion();
      const response = await axios.get(`${BASE_URL}/cdn/${version}/data/${lang}/champion.json`);
      const champions = Object.values(response.data.data);
  
      // Adicionar URLs de imagens para cada campeão, mantendo os atributos originais
      const championsWithImages = champions.map(champion => {
        const championWithImages = {
          ...champion, // Mantém todos os atributos originais
          images: {
            splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
            icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.id}.png`,
            loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`
          }
        };
        return championWithImages;
      });
  
      res.json(championsWithImages);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Erro ao buscar os campeões' });
    }
  });
  
  

// Endpoint para detalhes de um campeão específico (autenticado)
app.get('/champions/:name', authenticateToken, async (req, res) => {
    const lang = req.query.lang || 'pt_BR';
    const { name } = req.params;
    try {
      const version = await getLatestVersion();
      const response = await axios.get(`${BASE_URL}/cdn/${version}/data/${lang}/champion/${name}.json`);
      const champion = response.data.data[name];
  
      // Adicionar URLs de imagens e skins
      champion.images = {
        splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
        icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.id}.png`,
        loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`
      };
  
      // Processar as skins
      champion.skins = champion.skins.map(skin => ({
        id: skin.id,
        name: skin.name === "default" ? champion.name : skin.name, // Skin padrão usa o nome do campeão
        splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_${skin.num}.jpg`,
        loading: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_${skin.num}.jpg`
      }));
  
      res.json(champion);
    } catch (error) {
      console.error(error);
      res.status(404).json({ message: `Campeão ${name} não encontrado` });
    }
  });
  

// Porta do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
