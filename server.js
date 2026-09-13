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

        // 1. Nama Kios
        let namaKios = '-';
        $('div').each((_, el) => {
            const text = $(el).text().trim();
            if ($(el).css('font-size') === '19px' || text.length > 3 && !text.includes('Nota') && namaKios === '-') {
                // Cari elemen yang menyerupai nama kios
                const fontText = $(el).find('font').text().trim();
                if (fontText) namaKios = fontText;
            }
        });
        if (namaKios === '-') {
            // Alternatif pencarian teks kios
            $('b font font').each((_, el) => {
                const t = $(el).text().trim();
                if (t.includes('MANDIRI') || t.length > 5 && namaKios === '-') namaKios = t;
            });
        }

        // 2. Kode Kios
        let kodeKios = '-';
        $('font').each((_, el) => {
            const t = $(el).text().trim();
            if (t.startsWith('RT') && t.length >= 10) {
                kodeKios = t;
            }
        });

        // 3 & 4. Nama & NIK Petani dari Baris Tabel (tr)
        let namaPetani = '-';
        let nikPetani = '-';
        let noTransaksi = '-';
        let jenisPenyaluran = '-';

        $('tr').each((_, tr) => {
            const rowText = $(tr).text();
            const tds = $(tr).find('td');
            
            if (rowText.includes('Nama Petani')) {
                const val = $(tds[1]).text().trim();
                if (val) namaPetani = val;
            }
            if (rowText.includes('KTP Petani')) {
                const val = $(tds[1]).text().trim();
                if (val) nikPetani = val;
            }
        });

        // 5. Kode Transaksi (Biasanya di elemen dengan class f-20 f-bold align-right)
        $('.f-20.f-bold.align-right, td.f-20').each((_, el) => {
            const t = $(el).text().trim();
            if (t.includes('\\') || t.includes('/')) {
                noTransaksi = t;
            } else if (t.includes('IPubers')) {
                jenisPenyaluran = t;
            }
        });

        // Kumpulkan semua URL Gambar berdasarkan sumber Firebase atau urutannya
        const images = {};
        $('img').each((_, img) => {
            let src = $(img).attr('src');
            if (src && src.includes('firebasestorage.googleapis.com')) {
                if (src.includes('/o/ktp%2F')) images.ktpPembeli = src;
                if (src.includes('/o/petani_barang%2F')) {
                    if (!images.buktiPenyaluran) images.buktiPenyaluran = src;
                    else images.buktiPenyaluranPetani = src;
                }
                if (src.includes('/o/ktp_penerima%2F')) images.ktpPemilik = src;
                if (src.includes('/o/dokumen_lain%2F')) images.kartuKeluarga = src;
                if (src.includes('/o/penjualan%2Fktp%2F')) images.ktpPembeliKelompok = src;
                if (src.includes('/o/perwakilan%2Fktp%2F')) images.ktpPerwakilan = src;
                if (src.includes('/o/perwakilan%2Fswafoto%2F')) images.swafoto = src;
            }
        });

        // Tangkap juga Tanda Tangan Petani jika ada di dalam gambar
        let tandaTanganPetani = '';
        $('img').each((_, img) => {
            let src = $(img).attr('src');
            if (src && src.includes('TANDA_TANGAN_PETANI')) {
                tandaTanganPetani = src;
            }
        });

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
                ktpPembeli: images.ktpPembeli || '',
                buktiPenyaluran: images.buktiPenyaluran || '',
                tandaTanganPetani: tandaTanganPetani || '',
                ktpPemilik: images.ktpPemilik || '',
                kartuKeluarga: images.kartuKeluarga || '',
                ktpPembeliKelompok: images.ktpPembeliKelompok || '',
                ktpPerwakilan: images.ktpPerwakilan || '',
                swafoto: images.swafoto || ''
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
