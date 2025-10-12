// worker.js - 在背景執行 PDF 解析 (使用 ES Modules)

import * as pdfjsLib from './pdf.mjs';

// 這是 pdf.js 的要求：即使在 worker 內部，也要告訴它自己的輔助 worker 在哪裡
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';

self.onmessage = async function(e) {
    const { file } = e.data;

    try {
        const arrayBuffer = await file.arrayBuffer();
        // 使用 import 後的 pdfjsLib
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageCount = pdfDoc.numPages;
        const textContentByPage = {};

        for (let i = 1; i <= pageCount; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            textContentByPage[i] = textContent.items.map(item => item.str).join(' ');
        }

        self.postMessage({
            status: 'success',
            result: {
                name: file.name,
                pageCount: pageCount,
                textContentByPage: textContentByPage
            }
        });
    } catch (error) {
        console.error(`Error processing ${file.name} in worker:`, error);
        self.postMessage({
            status: 'error',
            fileName: file.name,
            error: error.message
        });
    }
};
