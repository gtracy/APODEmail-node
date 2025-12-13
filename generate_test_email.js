
const { fetchAPOD } = require('./src/services/apodService');
const fs = require('fs');
const path = require('path');

async function generate() {
    console.log('Fetching APOD data...');
    try {
        const result = await fetchAPOD();
        const outputPath = path.resolve(__dirname, 'test_email.html');
        fs.writeFileSync(outputPath, result.html);
        console.log(`Email HTML generated at: ${outputPath}`);
    } catch (error) {
        console.error('Error generating email:', error);
    }
}

generate();
