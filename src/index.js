const aws = require("aws-sdk");
const s3 = new aws.S3({ apiVersion: "2006-03-01" });
const fs = require("fs");
const tar = require("tar");
const Promise = require("bluebird");
const puppeteer = require("puppeteer");
const config = require("./config");

function PuppeteerLambda() {
  this.browser = null;
}

PuppeteerLambda.prototype.getBrowser = async function(options) {
  if (this.browser !== null && (await this.isBrowserAvailable())) {
    return this.browser;
  } else {
    if (
      process.env.CUSTOM_CHROME ||
      (process.env.CHROME_BUCKET && process.env.CHROME_KEY)
    ) {
      await this.setupChrome();
      this.browser = await puppeteer.launch(
        Object.assign(
          {
            headless: true,
            executablePath: config.executablePath,
            args: config.launchOptionForLambda,
            dumpio: !!exports.DEBUG,
            ignoreHTTPSErrors: true
          },
          options
        )
      );
    } else {
      this.browser = await puppeteer.launch(
        Object.assign(
          {
            dumpio: !!exports.DEBUG,
            ignoreHTTPSErrors: true
          },
          options
        )
      );
    }

    const version = await this.browser.version();
    console.log(`Launch chrome: ${version}`);
    return this.browser;
  }
};

PuppeteerLambda.prototype.isBrowserAvailable = async function() {
  try {
    await this.browser.version();
  } catch (e) {
    this.browser = null;
    return false;
  }
  return true;
};
PuppeteerLambda.prototype.setupChrome = async function() {
  if (!(await this.existsExecutableChrome())) {
    if (await this.existsLocalChrome()) {
      await this.setupLocalChrome();
    } else {
      await this.etupS3Chrome();
    }
  }
};
PuppeteerLambda.prototype.existsLocalChrome = async function() {
  return new Promise((resolve, reject) => {
    fs.exists(config.localChromePath, exists => {
      resolve(exists);
    });
  });
};
PuppeteerLambda.prototype.existsExecutableChrome = async function() {
  return new Promise((resolve, reject) => {
    fs.exists(config.executablePath, exists => {
      resolve(exists);
    });
  });
};
PuppeteerLambda.prototype.setupLocalChrome = async function() {
  return new Promise((resolve, reject) => {
    fs.createReadStream(config.localChromePath)
      .on("error", err => reject(err))
      .pipe(
        tar.x({
          C: config.setupChromePath
        })
      )
      .on("error", err => reject(err))
      .on("end", () => resolve());
  });
};
PuppeteerLambda.prototype.setupS3Chrome = async function() {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: config.remoteChromeS3Bucket,
      Key: config.remoteChromeS3Key
    };
    s3.getObject(params)
      .createReadStream()
      .on("error", err => reject(err))
      .pipe(
        tar.x({
          C: config.setupChromePath
        })
      )
      .on("error", err => reject(err))
      .on("end", () => resolve());
  });
};

module.exports = PuppeteerLambda;
