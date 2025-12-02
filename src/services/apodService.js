const axios = require('axios');

const API_URL = "https://apod.ellanan.com/api";

async function fetchAPOD() {
    try {
        const response = await axios.get(API_URL);
        const data = response.data;

        // Data structure:
        // {
        //   "title": "Moon Games",
        //   "explanation": "...",
        //   "date": "2025-11-29",
        //   "hdurl": "...",
        //   "url": "...",
        //   "media_type": "image",
        //   "copyright": "..."
        // }

        const title = `APOD - ${data.title}`;

        // Construct HTML manually
        let mediaHtml = '';
        if (data.media_type === 'image') {
            mediaHtml = `
                <center>
                    <a href="${data.hdurl || data.url}">
                        <img src="${data.url}" alt="${data.title}" style="max-width:100%">
                    </a>
                </center>
            `;
        } else if (data.media_type === 'video') {
            // Handle video (similar to legacy logic but using API data)
            // The API 'url' is usually the embed link for videos.
            const videoIdMatch = data.url.match(/embed\/(\S+)[?]/) || data.url.match(/embed\/([^?]+)/);
            let videoPreview = `<center><a href="${data.url}">${data.url}</a></center>`;

            if (videoIdMatch) {
                const videoId = videoIdMatch[1];
                const imgUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                videoPreview += `
                    <br>
                    <center>
                        <a href="${data.url}">
                            <img src="${imgUrl}">
                        </a>
                    </center>
                 `;
            }
            mediaHtml = videoPreview;
        }

        const copyrightHtml = data.copyright ? `<b>Image Credit & Copyright:</b> ${data.copyright}` : '';

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
            </head>
            <body bgcolor="#F4F4FF" text="#000000" link="#0000FF" vlink="#7F0F9F" alink="#FF0000">
                <center>
                    <h1> Astronomy Picture of the Day </h1>
                    <p>
                        <a href="https://apod.nasa.gov/apod/archivepix.html">Discover the cosmos!</a>
                        Each day a different image or photograph of our fascinating universe is featured, along with a brief explanation written by a professional astronomer.
                    </p>
                    <p>
                        ${data.date}
                    </p>
                </center>
                
                ${mediaHtml}

                <center>
                    <b> ${data.title} </b> <br> 
                    ${copyrightHtml}
                </center> 
                
                <p> 
                    <b> Explanation: </b> 
                    ${data.explanation}
                </p>
                
                <center>
                    <p>
                        <a href="https://apod.nasa.gov/apod/archivepix.html">Archive</a> | 
                        <a href="https://apod.nasa.gov/apod/lib/about_apod.html">About APOD</a>
                    </p>
                </center>

                <hr>
                <p>
                    <i>
                        <strong>This is an automated email. If you notice any problems, just send me a note at <a href="mailto:gtracy@gmail.com">gtracy@gmail.com</a>. 
                        You can add and remove email addresses to this distribution list here, <a href="https://apodemail.org">https://apodemail.org</a>.</strong>
                    </i>
                    <a href="https://apodemail.org/unsubscribe?email={{email}}">Unsubscribe</a>
                </p>
            </body>
            </html>
        `;

        return {
            title: title,
            html: html
        };

    } catch (error) {
        console.error("Error fetching APOD from API:", error);
        throw error;
    }
}

module.exports = { fetchAPOD };
