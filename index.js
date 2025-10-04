// index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PORT = process.env.PORT || 3000;
const app = express();

const imageFolder = path.join(__dirname, 'i', 'images');
if (!fs.existsSync(imageFolder)) fs.mkdirSync(imageFolder, { recursive: true });

const urls = [
  'https://plantsvsbrainrotswikia.com/brainrots',
  'https://plantsvsbrainrotswikia.com/gear',
  'https://plantsvsbrainrotswikia.com/plants'
];

function normalizeFilename(url) {
  let name = path.basename(url.split('?')[0]).toLowerCase();
  name = name.replace(/brainrots|gear|plants|seed/gi, '');
  name = name.replace(/-/g, '_');
  if (!name.endsWith('.png')) name = name.replace(/\.[a-z]+$/, '') + '.png';
  return name;
}

async function fetchPage(url) {
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

function extractImages(html, baseUrl) {
  const $ = cheerio.load(html);
  const images = [];
  $('img').each((i, el) => {
    let src = $(el).attr('src');
    if (!src) return;
    if (src.startsWith('/')) src = baseUrl + src;
    images.push(src);
  });
  return images;
}

async function downloadImage(url) {
  const filename = normalizeFilename(url);
  const filepath = path.join(imageFolder, filename);

  if (fs.existsSync(filepath)) return false;

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await sharp(response.data).png().toFile(filepath);
    console.log(`Downloaded and converted: ${filename}`);
    return true;
  } catch (err) {
    console.error(`Failed to download ${url}: ${err.message}`);
    return false;
  }
}

async function scrapeAll() {
  console.log('Scraping wiki pages...');
  let newImages = 0;

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const baseUrl = new URL(url).origin;
    const images = extractImages(html, baseUrl);

    for (const img of images) {
      if (await downloadImage(img)) newImages++;
    }
  }
  
  const directImage = 'https://plantsvsbrainrotswikia.com/images/gear/water-bucket.webp';
  if (await downloadImage(directImage)) newImages++;

  console.log(`Scrape complete. ${newImages} new images downloaded.`);
}
function generateHTML() {
  const files = fs.readdirSync(imageFolder);
  const count = files.length;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Plants vs Brainrots Images</title>
<style>
body { font-family: sans-serif; padding: 20px; background: #f0f0f0; }
h1 { margin-bottom: 20px; }
img { display: block; margin: 10px 0; max-width: 200px; }
</style>
</head>
<body>
<h1>Total Images: ${count}</h1>
${files.map(f => `<img src="/i/images/${f}" alt="${f}">`).join('\n')}
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf-8');
  console.log('Updated index.html');
}

app.use('/i/images', express.static(imageFolder));

app.get('/', (req, res) => {
  const html = fs.existsSync(path.join(__dirname, 'index.html'))
    ? fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
    : '<h1>No images yet</h1>';
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

(async () => {
  await scrapeAll();
  generateHTML();

  setInterval(async () => {
    await scrapeAll();
    generateHTML();
  }, 5 * 60 * 1000);
})();
