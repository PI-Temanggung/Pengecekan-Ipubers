const express = require('express');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const findByText = (label) => {
            let found = '-';
            $('*').each((_, el) => {
                const text = $(el).text().trim();
                if (text.toLowerCase() === label.toLowerCase()) {
                    const sibling = $(el).next().text().trim();
                    const parentText = $(el).parent().text().replace(text, '').trim();
                    if (sibling && sibling !== '-') {
                        found = sibling;
                        return false;
                    } else if (parentText) {
                        found = parentText.replace(':', '').trim();
                        return false;
                    }
                }
            });
            return found;
        };

        const noTransaksi = $('#no_transaksi').text().trim() || findByText('No Transaksi') || 'Valid';
        const namaKios = $('#nama_kios').text().trim() || findByText('Nama Kios');
        const kodeKios = $('#kode_kios').text().trim() || findByText('Kode Kios');
        const namaPetani = $('#nama_petani').text().trim() || findByText('Nama Petani');
        const nikPetani = $('#nik_petani').text().trim() || findByText('NIK');

        const images = [];
        $('img').each((_, img) => {
            let src = $(img).attr('src');
            if (src && !src.includes('svg') && !src.includes('logo')) {
                images.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: noTransaksi !== '-' ? noTransaksi : 'Nota Berhasil Diakses',
                namaKios: namaKios !== '-' ? namaKios : '-',
                kodeKios: kodeKios !== '-' ? kodeKios : '-',
                namaPetani: namaPetani !== '-' ? namaPetani : '-',
                nikPetani: nikPetani !== '-' ? nikPetani : '-',
            },
            images: {
                ktpPembeli: images[0] || '',
                buktiPenyaluran: images[1] || images[0] || '',
                allImages: images
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
