#!/usr/bin/env node

/**
 * Build Script
 * Bundles and minifies frontend assets for production
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const DIST_DIR = path.join(__dirname, '../dist');

// Get version from package.json for cache busting
const packageJson = require('../package.json');
const VERSION = packageJson.version;

async function build() {
  try {
    console.log('Building production assets...\n');

    // Bundle and minify JavaScript
    console.log('Bundling JavaScript...');
    await esbuild.build({
      entryPoints: [path.join(PUBLIC_DIR, 'js/app.js')],
      bundle: true,
      minify: true,
      sourcemap: true,
      target: ['es2020'],
      outfile: path.join(DIST_DIR, 'js/app.min.js')
    });
    console.log('✓ JavaScript bundled and minified\n');

    // Minify CSS
    console.log('Minifying CSS...');
    await esbuild.build({
      entryPoints: [path.join(PUBLIC_DIR, 'css/styles.css')],
      bundle: true,
      minify: true,
      sourcemap: true,
      outfile: path.join(DIST_DIR, 'css/styles.min.css')
    });
    console.log('✓ CSS minified\n');

    // Process and minify HTML
    console.log('Processing and minifying HTML...');
    const htmlPath = path.join(PUBLIC_DIR, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Update CSS reference (match with or without leading slash, preserve/add version)
    html = html.replace(
      /href="\/?css\/styles\.css(\?ver=[^"]*)?"\/?/g,
      `href="/css/styles.min.css?ver=${VERSION}"`
    );

    // Update JS reference (match with or without leading slash, preserve/add version)
    html = html.replace(
      /src="\/?js\/app\.js(\?ver=[^"]*)?"\/?/g,
      `src="/js/app.min.js?ver=${VERSION}"`
    );

    // Minify HTML
    html = html
      .replace(/\s*\n\s*/g, '\n')  // Remove extra whitespace between lines
      .replace(/\n+/g, '\n')        // Remove multiple newlines
      .replace(/>\s+</g, '><')      // Remove whitespace between tags
      .replace(/<!--.*?-->/g, '')   // Remove HTML comments
      .trim();

    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
    console.log('✓ HTML minified\n');

    // Copy and minify favicon.svg
    console.log('Processing favicon.svg...');
    const faviconSvg = fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), 'utf8');
    const minifiedSvg = faviconSvg
      .replace(/\s*\n\s*/g, ' ')     // Remove newlines and extra whitespace
      .replace(/>\s+</g, '><')        // Remove whitespace between tags
      .replace(/<!--.*?-->/g, '')     // Remove comments
      .replace(/\s{2,}/g, ' ')        // Replace multiple spaces with single space
      .trim();
    fs.writeFileSync(path.join(DIST_DIR, 'favicon.svg'), minifiedSvg);
    console.log('✓ favicon.svg minified and copied\n');

    // Copy favicon.ico
    console.log('Copying favicon.ico...');
    fs.copyFileSync(
      path.join(PUBLIC_DIR, 'favicon.ico'),
      path.join(DIST_DIR, 'favicon.ico')
    );
    console.log('✓ favicon.ico copied\n');

    // Report file sizes
    console.log('Build complete! File sizes:');
    const jsSize = fs.statSync(path.join(DIST_DIR, 'js/app.min.js')).size;
    const cssSize = fs.statSync(path.join(DIST_DIR, 'css/styles.min.css')).size;
    const svgSize = fs.statSync(path.join(DIST_DIR, 'favicon.svg')).size;
    console.log(`  JavaScript: ${(jsSize / 1024).toFixed(2)} KB`);
    console.log(`  CSS: ${(cssSize / 1024).toFixed(2)} KB`);
    console.log(`  Favicon SVG: ${(svgSize / 1024).toFixed(2)} KB`);
    console.log('\nAssets ready in dist/');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
