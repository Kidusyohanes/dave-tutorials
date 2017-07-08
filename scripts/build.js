#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const htmlMinify = require("html-minifier").minify;
const showdown = require("showdown");
const handlebars = require("handlebars");
const moment = require("moment");

const htmlMinifyOpts = {
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    removeComments: true
};
const showdownTableExtension = function() {
    return [{
        type: 'output',
        regex: '<table>',
        replace: '<table class="table">'
    }];
};
const mdConverter = new showdown.Converter({
    omitExtraWLInCodeBlocks: true,
    prefixHeaderId: "sec-",
    parseImgDimensions: true,
    simplifiedAutoLink: true,
    strikethrough: true,
    tables: true,
    extensions: [showdownTableExtension]
});

const srcDir = path.join(__dirname, "../src");
const docsDir = path.join(__dirname, "../docs");

const templatePath = path.join(srcDir, "template.html")
const template = fs.readFileSync(templatePath, "utf-8");
const mergeWithTemplate = handlebars.compile(template);

const sharedCSS = fs.readFileSync(path.join(srcDir, "shared.css"), "utf-8");

function isNewer(srcPath, destPath) {
    if (!fs.existsSync(destPath)) {
        return true;
    }
    let srcStat = fs.statSync(srcPath);
    let destStat = fs.statSync(destPath);
    return srcStat.ctime > destStat.ctime;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
}

function processIndex(srcPath, destPath) {
    if (isNewer(srcPath, destPath)) {
        let contents = fs.readFileSync(srcPath, "utf-8");
        let mergeIndex = handlebars.compile(contents);
        let merged = mergeIndex({sharedCSS: sharedCSS});
        let minified = htmlMinify(merged, htmlMinifyOpts);
        fs.writeFileSync(destPath, minified, "utf-8");
    }
}

function copyTree(srcPath, destPath) {
    ensureDir(destPath);
    fs.readdirSync(srcPath).forEach(f => {
        let srcFilePath = path.join(srcPath, f);
        let destFilePath = path.join(destPath, f);
        if (fs.statSync(srcFilePath).isDirectory()) {
            copyTree(srcFilePath, destFilePath);
        } else {
            if (isNewer(srcFilePath, destFilePath)) {
                fs.createReadStream(srcFilePath).pipe(fs.createWriteStream(destFilePath));
            }            
        }
    });
}

function processTutorial(srcPath, destPath) {
    ensureDir(destPath);

    //if the tutorial has an img directory, process that
    let srcImgDir = path.join(srcPath, "img");
    if (fs.existsSync(srcImgDir)) {
        copyTree(srcImgDir, path.join(destPath, "img"))
    }

    let srcTutorial = path.join(srcPath, "index.md");
    let destTutorial = path.join(destPath, "index.html");

    if (isNewer(srcTutorial, destTutorial) || isNewer(templatePath, destTutorial)) {        
        //load the tutorial meta-data
        let meta = require(path.join(srcPath, "meta.json"));

        //default author
        meta.author = meta.author || {name: "Dave Stearns", url: "https://ischool.uw.edu/people/faculty/dlsinfo"};

        //set last edited time
        meta.lastEdited = moment(fs.statSync(srcTutorial).mtimeMs).format("ll");

        //set the content
        let md = fs.readFileSync(srcTutorial, "utf-8");
        meta.content = mdConverter.makeHtml(md);

        //set shared CSS
        meta.sharedCSS = sharedCSS;

        //merge and minify
        let merged = mergeWithTemplate(meta);
        let minified = htmlMinify(merged, htmlMinifyOpts);
        
        //write to destination
        fs.writeFileSync(destTutorial, minified, "utf-8");
    }
}

//ensure docs directory exists
ensureDir(docsDir);

//process the table of contents page
processIndex(path.join(srcDir, "index.html"), path.join(docsDir, "index.html"));

//process the global img and lib dirs
copyTree(path.join(srcDir, "img"), path.join(docsDir, "img"));
copyTree(path.join(srcDir, "lib"), path.join(docsDir, "lib"));

//process each tutorial directory
fs.readdirSync(srcDir)
    .filter(f => fs.statSync(path.join(srcDir, f)).isDirectory() && f !== "img" && f !== "lib")
    .forEach(dir => processTutorial(path.join(srcDir, dir), path.join(docsDir, dir)));
