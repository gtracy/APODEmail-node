
const { fetchAPOD } = require('./src/services/apodService');
const fs = require('fs');
const path = require('path');

async function generate() {
    console.log('Fetching APOD data...');
    try {
        const result = await fetchAPOD();
        const outputPath = path.resolve(__dirname, 'test_email.html');
        fs.writeFileSync(outputPath, result.html);
        const outputTextPath = path.resolve(__dirname, 'test_email.txt');
        fs.writeFileSync(outputTextPath, result.text);
        console.log(`Email HTML generated at: ${outputPath}`);
        console.log(`Email Text generated at: ${outputTextPath}`);
    } catch (error) {
        console.error('Error generating email:', error);
    }
}

generate();
