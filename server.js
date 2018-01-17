var express = require('express');
var app = express();
var sse = require('./sse');
var stream = require('stream'); 
var streamifier = require('streamifier');
var puppeteer = require('puppeteer');
var base64 = require('base64-stream');

var PNG = require('pngjs').PNG;
var pixelmatch = require('pixelmatch');

var amp, canonical, ampOutput, canonicalOutput, comparedOutput, data, img1, img2;
var connections = [];
var chunks = [];
var filesRead = 0;


app.use(sse)
var path = require('path');
var public = __dirname + "/public/";
var _ph, _page, _outObj;

app.get('/', function (req, res) {
  res.sendFile(path.join(public + "index.html"));
});

app.use('/', express.static(public));
app.listen(8080, function () {
  console.log('Listening on port 8080...')
});

app.get('/output', function (req, res) {
  amp = req.query.amp;
  canonical = req.query.canonical;
  

  (async () => {
    filesRead = 0;
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({width: 640, height:1000})
    await page.goto(amp);
    const ampBuffer = await page.screenshot({fullPage: true});
    ampOutput= await ampBuffer.toString('base64');
    const ampStream = await streamifier.createReadStream(ampBuffer);
    img1 = ampStream.pipe(new PNG()).on('parsed', doneReading);
    await page.goto(canonical);
    const canonicalBuffer = await page.screenshot({fullPage: true});
    canonicalOutput= await canonicalBuffer.toString('base64');
    const canonicalStream = await streamifier.createReadStream(canonicalBuffer);
    img2 = canonicalStream.pipe(new PNG()).on('parsed', doneReading);
    await browser.close();



  })();
  res.sendStatus(200)
});

app.get('/stream', function (req, res) {
  res.sseSetup();
  res.sseSend(data);
  connections.push(res);
});

function doneReading() {
  if (++filesRead < 2) return;
  var diff = new PNG({width: img1.width, height: img1.height});
  pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {threshold: 0.1});
  diff.pack().pipe(base64.encode().on("data", function (chunk) {
    chunks.push(chunk);
  })).on("end", function(){
    data = {
      'ampUrl': [amp],
      'ampContent': [ampOutput],
      'canonicalUrl': [canonical],
      'canonicalContent': [canonicalOutput],
      'comparedContent': [chunks.join("")]
    };
    for (var i = 0; i < connections.length; i++) {
      connections[i].sseSend(data);
    }
  });

}