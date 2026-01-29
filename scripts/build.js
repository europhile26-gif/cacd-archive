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

// List of JavaScript files to minify
const JS_FILES = ['app.js', 'auth.js', 'nav.js', 'dashboard.js', 'admin.js', 'login.js'];

// List of HTML files to process
const HTML_FILES = [
  'index.html',
  'login.html',
  'register.html',
  'reset-password.html',
  'dashboard.html',
  'admin.html'
];

async function build() {
  try {
    console.log('Building production assets...\n');

    // Bundle and minify JavaScript files
    console.log('Bundling JavaScript...');
    for (const jsFile of JS_FILES) {
      await esbuild.build({
        entryPoints: [path.join(PUBLIC_DIR, 'js', jsFile)],
        bundle: false, // Don't bundle dependencies, keep separate
        minify: true,
        sourcemap: true,
        target: ['es2020'],
        outfile: path.join(DIST_DIR, 'js', jsFile.replace('.js', '.min.js'))
      });
      console.log(`  ✓ ${jsFile} minified`);
    }
    console.log('✓ All JavaScript bundled and minified\n');

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

    // Process and minify HTML files
    console.log('Processing and minifying HTML...');
    for (const htmlFile of HTML_FILES) {
      const htmlPath = path.join(PUBLIC_DIR, htmlFile);
      let html = fs.readFileSync(htmlPath, 'utf8');

      // Update CSS reference
      html = html.replace(
        /href="\/?css\/styles\.css(\?ver=[^"]*)?"/g,
        `href="/css/styles.min.css?ver=${VERSION}"`
      );

      // Update JS references for all JS files
      for (const jsFile of JS_FILES) {
        const minFileName = jsFile.replace('.js', '.min.js');
        const regex = new RegExp(
          `src="\\/?js\\/${jsFile.replace('.', '\\.')}(\\?ver=[^"]*)?"`,
          'g'
        );
        html = html.replace(regex, `src="/js/${minFileName}?ver=${VERSION}"`);
      }

      // Minify HTML
      html = html
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n+/g, '\n')
        .replace(/>\s+</g, '><')
        .replace(/<!--.*?-->/gs, '')
        .trim();

      fs.writeFileSync(path.join(DIST_DIR, htmlFile), html);
      console.log(`  ✓ ${htmlFile} minified`);
    }
    console.log('✓ All HTML minified\n');

    // Copy and minify favicon.svg
    console.log('Processing favicon.svg...');
    const faviconSvg = fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), 'utf8');
    const minifiedSvg = faviconSvg
      .replace(/\s*\n\s*/g, ' ') // Remove newlines and extra whitespace
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .replace(/<!--.*?-->/g, '') // Remove comments
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
      .trim();
    fs.writeFileSync(path.join(DIST_DIR, 'favicon.svg'), minifiedSvg);
    console.log('✓ favicon.svg minified and copied\n');

    // Copy favicon.ico
    console.log('Copying favicon.ico...');
    fs.copyFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), path.join(DIST_DIR, 'favicon.ico'));
    console.log('✓ favicon.ico copied\n');

    // Report file sizes
    console.log('Build complete! File sizes:');

    // Report JS sizes
    console.log('\nJavaScript:');
    let totalJsSize = 0;
    for (const jsFile of JS_FILES) {
      const minFile = jsFile.replace('.js', '.min.js');
      const jsSize = fs.statSync(path.join(DIST_DIR, 'js', minFile)).size;
      totalJsSize += jsSize;
      console.log(`  ${minFile}: ${(jsSize / 1024).toFixed(2)} KB`);
    }
    console.log(`  Total JS: ${(totalJsSize / 1024).toFixed(2)} KB`);

    // Report CSS size
    const cssSize = fs.statSync(path.join(DIST_DIR, 'css/styles.min.css')).size;
    console.log('\nCSS:');
    console.log(`  styles.min.css: ${(cssSize / 1024).toFixed(2)} KB`);

    // Report favicon sizes
    const svgSize = fs.statSync(path.join(DIST_DIR, 'favicon.svg')).size;
    console.log('\nFavicons:');
    console.log(`  favicon.svg: ${(svgSize / 1024).toFixed(2)} KB`);

    console.log('\nAssets ready in dist/');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
