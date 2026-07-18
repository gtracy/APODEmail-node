require('dotenv').config();
const express = require('express');
const routes = require('./src/routes');
const logger = require('./src/services/logger');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable trust proxy (1 hop) so Express correctly detects original protocol/host behind App Engine load balancer securely
app.set('trust proxy', 1);

// Canonical Redirection Middleware (HTTPS & Domain Name Enforcement)
app.use((req, res, next) => {
    // Skip in non-production environments
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    // Skip GAE internal requests (Cron, Task Queues)
    if (
        req.headers['x-appengine-cron'] ||
        req.headers['x-appengine-taskname'] ||
        req.headers['x-appengine-queuename']
    ) {
        return next();
    }

    const host = (req.hostname || '').toLowerCase();
    const protocol = req.protocol; // Populated correctly by Express when trust proxy is enabled

    const isCanonicalHost = host === 'apodemail.org';
    const isHttps = protocol === 'https';

    if (!isCanonicalHost || !isHttps) {
        const canonicalUrl = `https://apodemail.org${req.originalUrl.replace(/^\/index\.html(?=\?|$)/, '/')}`;
        logger.info({
            event: 'canonical_redirect',
            originalUrl: req.originalUrl,
            host,
            protocol,
            targetUrl: canonicalUrl
        }, 'Redirecting to canonical URL');
        return res.redirect(301, canonicalUrl);
    }

    // Redirect /index.html to /
    if (req.path === '/index.html') {
        let targetUrl = 'https://apodemail.org/';
        try {
            const parsedUrl = new URL(req.originalUrl, 'https://apodemail.org');
            const normalizedPathAndQuery = (parsedUrl.pathname + parsedUrl.search).replace(/^\/index\.html/, '/');
            targetUrl = `https://apodemail.org${normalizedPathAndQuery}`;
        } catch (error) {
            targetUrl = 'https://apodemail.org/';
        }
        logger.info({
            event: 'index_redirect',
            originalUrl: req.originalUrl,
            targetUrl
        }, 'Redirecting /index.html to /');
        return res.redirect(301, targetUrl);
    }

    next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Rate Limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

app.use('/', routes);

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
