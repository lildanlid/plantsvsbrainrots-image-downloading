// index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PORT = process.env.PORT || 3000;
const app = express();

// Folder to store images
const imageFolder = path.join(__dirname, 'i', 'images');
if (!fs.existsSync(imageFolder)) fs.mkdirSync(imageFolder, { recursive: true });

// Wiki pages to scrape
const urls = [
  'https://plantsvsbrainrotswikia.com/brainrots',
  'https://plantsvsbrainrotswikia.com/gear',
  'https://plantsvsbrainrotswikia.com/plants'
];

// Normalize filenames
function normalizeFilename(url) {
  let name = path.basename(url.split('?')[0]).toLowerCase();

  // Remove unwanted words anywhere in the filename
  name = name.replace(/brainrots|brainrot|gear|plants|seed/gi, '');

  // Replace hyphens with underscores
  name = name.replace(/-/g, '_');

  // Remove leading/trailing underscores
  name = name.replace(/^_+|_+$/g, '');

  // Replace multiple underscores with a single underscore
  name = name.replace(/_+/g, '_');

  // Ensure it ends with .png
  name = name.replace(/\.[a-z]+$/, '') + '.png';

  return name;
}

// Clean existing images with trailing underscores
function cleanExistingImages() {
  if (!fs.existsSync(imageFolder)) return;
  const files = fs.readdirSync(imageFolder);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let name = path.basename(file, ext);

    // Remove trailing/leading underscores, collapse multiple
    let newName = name.replace(/^_+|_+$/g, '').replace(/_+/g, '_') + '.png';
    if (newName !== file) {
      fs.renameSync(path.join(imageFolder, file), path.join(imageFolder, newName));
      console.log(`Renamed: ${file} → ${newName}`);
    }
  }
}

// Fetch HTML
async function fetchPage(url) {
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (err) {
    console.error(`Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

// Extract image URLs
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

// Download and convert image to .png
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

// Scrape all URLs
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

  // Direct image link
  const directImage = 'https://plantsvsbrainrotswikia.com/images/gear/water-bucket.webp';
  if (await downloadImage(directImage)) newImages++;

  // Clean existing filenames
  cleanExistingImages();

  console.log(`Scrape complete. ${newImages} new images downloaded.`);
}

// Generate home page
function generateHTML() {
  const files = fs.existsSync(imageFolder) ? fs.readdirSync(imageFolder) : [];
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

// Serve static images
app.use('/i/images', express.static(imageFolder));

// Serve home page
app.get('/', (req, res) => {
  const html = fs.existsSync(path.join(__dirname, 'index.html'))
    ? fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
    : '<h1>No images yet</h1>';
  res.send(html);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Initial scrape and repeat every 5 minutes
(async () => {
  await scrapeAll();
  generateHTML();
  setInterval(async () => {
    await scrapeAll();
    generateHTML();
  }, 5 * 60 * 1000);
})();
