const fs = require('fs');
const { createCanvas } = require('canvas');

// Crea un'icona semplice per LLM Wiki
const size = 512;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Sfondo gradiente blu
const gradient = ctx.createLinearGradient(0, 0, size, size);
gradient.addColorStop(0, '#3B82F6');
gradient.addColorStop(1, '#1E40AF');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, size, size);

// Testo "LLM"
ctx.fillStyle = 'white';
ctx.font = 'bold 120px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('LLM', size/2, size/2 - 40);

// Testo "Wiki"
ctx.font = 'bold 80px Arial';
ctx.fillText('Wiki', size/2, size/2 + 60);

// Salva come PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('icon.png', buffer);
console.log('Icon created: icon.png');
