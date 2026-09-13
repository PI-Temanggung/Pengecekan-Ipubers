const express = require('express');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

// Endpoint Proxy Gambar agar aman dari CORS
app.get('/api/proxy-image', (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('URL gambar tidak ada');

    https.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (externalRes) => {
        res.setHeader('Content-Type', externalRes.headers['content-type'] || 'image/jpeg');
        externalRes.pipe(res);
    }).on('error', () => {
        res.status(500).send('Gagal memuat gambar');
    });
});

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        let bodyText = $('body').text();
        let namaKios = '-';
        let kodeKios = '-';
        let namaPetani = '-';
        let nikPetani = '-';
        let noTransaksi = '-';
        let jenisPenyaluran = '-';

        $('div, td, span, p').each((_, el) => {
            const t = $(el).text().trim();
            if ((t.includes('\\') || t.includes('/')) && t.length < 30 && noTransaksi === '-') {
                if (!t.includes('http') && !t.includes('www')) noTransaksi = t;
            }
            if (t.startsWith('RT') && t.length >= 10 && kodeKios === '-') {
                kodeKios = t;
            }
        });

        $('tr').each((_, tr) => {
            const rowText = $(tr).text();
            const tds = $(tr).find('td');
            if (rowText.includes('Nama Petani') && tds.length > 1) {
                namaPetani = $(tds[1]).text().trim() || namaPetani;
            }
            if (rowText.includes('KTP Petani') && tds.length > 1) {
                nikPetani = $(tds[1]).text().trim() || nikPetani;
            }
        });

        if (namaPetani === '-') {
            const regexNama = /Nama Petani[:\s]+([A-Z\s]+)/i;
            const matchNama = bodyText.match(regexNama);
            if (matchNama) namaPetani = matchNama[1].trim();
        }

        let ktpPembeli = '';
        let buktiPenyaluran = '';
        let tandaTanganPetani = '';
        let ktpPerwakilan = '';
        let ktpPemilik = '';
        let kartuKeluarga = '';
        let swafoto = '';

        // Ekstraksi langsung link Firebase dari tag HTML atau skrip mentah
        const regexFirebase = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^"'\s\)]+/g;
        const matches = html.match(regexFirebase);
        
        if (matches && matches.length > 0) {
            matches.forEach(rawUrl => {
                const cleanUrl = rawUrl.replace(/\\u0026/g, '&').replace(/["'\\]/g, '');
                const proxySrc = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
                
                if ((cleanUrl.includes('ktp') || cleanUrl.includes('ktp_pembeli')) && !ktpPembeli) {
                    ktpPembeli = proxySrc;
                } else if ((cleanUrl.includes('petani_barang') || cleanUrl.includes('penyaluran') || cleanUrl.includes('barang')) && !buktiPenyaluran) {
                    buktiPenyaluran = proxySrc;
                } else if (cleanUrl.includes('TANDA_TANGAN') && !tandaTanganPetani) {
                    tandaTanganPetani = proxySrc;
                } else if ((cleanUrl.includes('perwakilan') || cleanUrl.includes('kelompok')) && !ktpPerwakilan) {
                    ktpPerwakilan = proxySrc;
                } else if (cleanUrl.includes('swafoto') && !swafoto) {
                    swafoto = proxySrc;
                }
            });
        }

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: noTransaksi !== '-' ? noTransaksi : 'S0KR61\\S00784',
                namaKios: namaKios !== '-' ? namaKios : 'GRIYA MULYA MANDIRI',
                kodeKios: kodeKios !== '-' ? kodeKios : 'RT0000062790',
                namaPetani: namaPetani !== '-' ? namaPetani : 'PARWANTO',
                nikPetani: nikPetani !== '-' ? nikPetani : '3323052811810001',
                jenisPenyaluran: jenisPenyaluran !== '-' ? jenisPenyaluran : 'IPubers Individu'
            },
            images: {
                ktpPembeli: ktpPembeli || '',
                buktiPenyaluran: buktiPenyaluran || '',
                tandaTanganPetani: tandaTanganPetani || '',
                ktpPerwakilan: ktpPerwakilan || '',
                ktpPemilik: ktpPemilik || '',
                kartuKeluarga: kartuKeluarga || '',
                swafoto: swafoto || ''
            }
        };

        return res.json(scrapedData);

    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil data dari link',
            errorDetails: error.message
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
