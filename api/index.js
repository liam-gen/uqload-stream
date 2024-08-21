const express = require('express');
const axios = require('axios');
const { PassThrough } = require('stream');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

async function getVideoInformations(videoId){

    const response = await axios({
        method: 'get',
        url: `https://uqload.ws/embed-${videoId}.html`,
    });


    const $ = cheerio.load(response.data)

    let result = {
        directUrl: false,
        title: false,
        poster: false
      };
  
      // Trouver le script contenant 'new Clappr.Player'
      $('script').each((i, element) => {
        const scriptContent = $(element).html();
        
        if (scriptContent && scriptContent.includes('new Clappr.Player')) {
          // Extraire l'URL du MP4
          const mp4UrlMatch = scriptContent.match(/sources\s*:\s*\["([^"]+)"\]/);
          if (mp4UrlMatch) {
            result.directUrl = mp4UrlMatch[1];
          }
  
          // Extraire le title
          const titleMatch = scriptContent.match(/title\s*:\s*"([^"]+)"/);
          if (titleMatch) {
            result.title = titleMatch[1];
          }
  
          // Extraire le poster
          const posterMatch = scriptContent.match(/poster\s*:\s*"([^"]+)"/);
          if (posterMatch) {
            result.poster = posterMatch[1];
          }
        }
      });

      return result
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

app.get("/video", async (req, res) => {
   return res.json(await getVideoInformations(req.query.videoId))
})

// Route pour streamer la vidéo
app.get('/stream', async (req, res) => {
    let videoInfos = await getVideoInformations(req.query.videoId);
    const videoUrl = videoInfos["directUrl"]; // L'URL directe de la vidéo
    const refererUrl = req.query.referer || 'https://m' + getRandomInt(200) + '.uqload.ws';
  
    if (!videoUrl) {
      return res.status(400).send('L\'URL de la vidéo est requise.');
    }
  
    try {
      // Obtenir la taille de la vidéo
      const headResponse = await axios({
        method: 'head',
        url: videoUrl,
        headers: {
          Referer: refererUrl,
        }
      });
  
      const contentLength = parseInt(headResponse.headers['content-length'], 10);
      if (isNaN(contentLength)) {
        return res.status(500).send('Impossible d\'obtenir la taille de la vidéo');
      }
  
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = Math.min(contentLength - 1, parseInt(parts[1], 10) || contentLength - 1);

  
        const chunkSize = (end - start) + 1;
        const headers = {
          'Content-Range': `bytes ${start}-${end}/${contentLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4'
        };
  
        res.writeHead(206, headers);

        const streamResponse = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream',
          headers: {
            Referer: 'https://m' + 10*getRandomInt(9) + '.uqload.ws',
            Range: `bytes=${start}-${end}`
          }
        });
  
        const passThroughStream = new PassThrough();
        streamResponse.data.pipe(passThroughStream);
  
        passThroughStream.pipe(res, { end: true });
  
      } else {
        res.writeHead(200, {
          'Content-Length': contentLength,
          'Content-Type': 'video/mp4'
        });
  
        const streamResponse = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream',
          headers: {
            Referer: 'https://m' + 10*getRandomInt(9) + '.uqload.ws'
          }
        });
  
        const passThroughStream = new PassThrough();
        streamResponse.data.pipe(passThroughStream);
  
        passThroughStream.pipe(res, { end: true });
      }
    } catch (error) {
      console.error(error.message);
      if (!res.headersSent) {
        res.status(500).send('Erreur lors du streaming de la vidéo.');
      }
    }
  });


app.get('/download', async (req, res) => {

    let videoInfos = await getVideoInformations(req.query.videoId)

    let videoUrl = videoInfos["directUrl"];

    let refId = getRandomInt(200);
    const refererUrl = req.query.referer || 'https://m'+refId+'.uqload.ws';


  if (!videoUrl) {
    return res.status(400).send('L\'URL de la vidéo est requise.');
  }

  try {
    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      headers: {
        Referer: refererUrl,
      }
    });

    if (response.status !== 200) {
      return res.status(500).send('Erreur lors du téléchargement de la vidéo.');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${videoInfos["title"]}.mp4"`);
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Content-Length', response.headers['content-length']);

    response.data.pipe(res);

  } catch (error) {
    console.error('Erreur lors du téléchargement de la vidéo :', error);
    if (!res.headersSent) {
      res.status(500).send('Erreur lors du téléchargement de la vidéo.');
    }
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});

module.exports = app;