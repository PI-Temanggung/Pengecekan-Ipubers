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

app.get('/api/get-nota', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong' });
    }

    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        // Fungsi pintar untuk mencari teks berdasarkan label atau keyword di sekitarnya
        const extractTextByKeyword = (keywords) => {
            let result = '-';
            $('*').each((_, el) => {
                const text = $(el).text().trim();
                for (let kw of keywords) {
                    if (text.toLowerCase().includes(kw.toLowerCase()) && text.length < 100) {
                        // Cek apakah elemen ini sendiri adalah nilainya atau saudaranya
                        const nextText = $(el).next().text().trim();
                        const childrenText = $(el).children().text().trim();
                        const pureText = text.replace(kw, '').replace(/[:\-]/g, '').trim();
                        
                        if (pureText && pureText.length > 2 && pureText.toLowerCase() !== kw.toLowerCase()) {
                            result = pureText;
                            return false;
                        } else if (nextText && nextText.length > 0) {
                            result = nextText;
                            return false;
                        }
                    }
                }
            });
            return result;
        };

        // Ambil data teks dengan berbagai kemungkinan nama label di iPubers
        let noTransaksi = $('#no_transaksi').text().trim() || extractTextByKeyword(['no transaksi', 'nomor transaksi', 'transaksi']);
        let namaKios = $('#nama_kios').text().trim() || extractTextByKeyword(['nama kios', 'kios']);
        let kodeKios = $('#kode_kios').text().trim() || extractTextByKeyword(['kode kios']);
        let namaPetani = $('#nama_petani').text().trim() || extractTextByKeyword(['nama petani', 'nama pembeli']);
        let nikPetani = $('#nik_petani').text().trim() || extractTextByKeyword(['nik']);

        // Ambil semua URL gambar yang ada di halaman
        const images = [];
        $('img').each((_, img) => {
            let src = $(img).attr('src') || $(img).attr('data-src');
            if (src && !src.includes('svg') && !src.includes('logo') && !src.includes('icon')) {
                images.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });

        // Jika gambar tidak ditemukan lewat tag <img>, cari di dalam background-image style
        $('[style*="background"]').each((_, el) => {
            const style = $(el).attr('style');
            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1]) {
                const bgUrl = match[1];
                images.push(bgUrl.startsWith('http') ? bgUrl : new URL(bgUrl, url).href);
            }
        });

        const scrapedData = {
            success: true,
            admin: {
                noTransaksi: noTransaksi !== '-' ? noTransaksi : 'Berhasil Diakses',
                namaKios: namaKios !== '-' ? namaKios : 'Kios iPubers',
                kodeKios: kodeKios !== '-' ? kodeKios : '-',
                namaPetani: namaPetani !== '-' ? namaPetani : 'Data Tertera di Nota',
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
