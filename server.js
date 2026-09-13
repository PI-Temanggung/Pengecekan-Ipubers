const express = require('express');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Fungsi pembantu untuk mengambil HTML target secara native
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
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

        // Fungsi pintar untuk mencari teks berdasarkan kata kunci di dalam label / tabel iPubers
        const findTextByLabel = (keywords) => {
            let result = '-';
            $('*').each((_, el) => {
                const text = $(el).text().trim();
                for (let kw of keywords) {
                    if (text.toLowerCase() === kw.toLowerCase()) {
                        // Cek teks di elemen setelahnya atau di dalam elemen itu sendiri
                        const nextText = $(el).next().text().trim();
                        const parentNextText = $(el).parent().find('td, span, div, b').last().text().trim();
                        
                        if (nextText && nextText !== text) {
                            result = nextText;
                            return false;
                        } else if (parentNextText && parentNextText !== text) {
                            result = parentNextText;
                            return false;
                        }
                    }
                }
            });
            return result !== '-' ? result : '';
        };

        // Ekstraksi data administratif dengan berbagai variasi kata kunci iPubers
        const noTransaksi = $('#no_transaksi').text().trim() || findTextByLabel(['No. Transaksi', 'Nomor Transaksi', 'No Transaksi']) || 'Nota Valid';
        const namaKios = $('#nama_kios').text().trim() || findTextByLabel(['Nama Kios', 'Kios']);
        const kodeKios = $('#kode_kios').text().trim() || findTextByLabel(['Kode Kios', 'ID Kios']);
        const namaPetani = $('#nama_petani').text().trim() || findTextByLabel(['Nama Petani', 'Petani', 'Nama Pembeli']);
        const nikPetani = $('#nik_petani').text().trim() || findTextByLabel(['NIK', 'NIK Petani']);

        // Mengambil seluruh tautan gambar yang ada di halaman nota
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
                noTransaksi: noTransaksi,
                namaKios: namaKios,
                kodeKios: kodeKios,
                namaPetani: namaPetani,
                nikPetani: nikPetani,
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
