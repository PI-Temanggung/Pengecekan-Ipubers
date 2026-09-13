const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Fungsi fleksibel untuk mencari teks di dalam tabel atau elemen halaman iPubers
        const getTextByKeyword = (keywords) => {
            let foundText = '-';
            $('td, th, span, div, p').each((_, el) => {
                const text = $(el).text().trim();
                for (let kw of keywords) {
                    if (text.toLowerCase() === kw.toLowerCase() || text.toLowerCase().startsWith(kw.toLowerCase() + ':')) {
                        // Cek teks di elemen yang sama atau elemen setelahnya
                        const nextText = $(el).next().text().trim();
                        if (nextText) {
                            foundText = nextText;
                            return false;
                        }
                    }
                }
            });
            return foundText;
        };

        // Kumpulkan semua gambar bukti / KTP dari halaman
        const images = [];
        $('img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && !src.includes('data:image/svg') && !src.includes('logo')) {
                images.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: $('#no_transaksi').text().trim() || getTextByKeyword(['No. Transaksi', 'No Transaksi', 'Nota']),
                namaKios: $('#nama_kios').text().trim() || getTextByKeyword(['Nama Kios', 'Kios']),
                kodeKios: $('#kode_kios').text().trim() || getTextByKeyword(['Kode Kios']),
                namaPetani: $('#nama_petani').text().trim() || getTextByKeyword(['Nama Petani', 'Petani']),
                nikPetani: $('#nik_petani').text().trim() || getTextByKeyword(['NIK']),
            },
            images: {
                ktpPembeli: images[0] || '',
                buktiPenyaluran: images[1] || '',
                ktpPerwakilan: images[2] || null,
                allImages: images
            }
        };

        return res.json(scrapedData);

    } catch (error) {
        console.error('Scraping Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil data dari link iPubers',
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
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
