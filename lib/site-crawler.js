const path = require(`path`);
const childProcess = require(`child_process`);
const EventEmitter = require(`events`);
const { SiteChecker } = require(`broken-link-checker`);

const exportPluginKeys = require(`../plugins/plugins.json`).exportPlugins;

const BASE_URL = `http://localhost:5000/`;

/**
 * @emits passingPage The URL of a passing (internal) page.
 * @emits failingPage The URL of a failing (internal) page and an error string.
 * @emits externalLinkFound The URL of an external link.
 */
class SiteCrawler extends EventEmitter {
  /**
   * Starts the production OFL server by creating a new child process.
   * Make sure that 'make all' has been called before this function is executed!
   * @returns {Promise} Promise that resolves as soon as the OFL server is up and running, or rejects if the process stops with an error before.
   */
  async startServer() {
    const onServerData = new Promise((resolve, reject) => {
      this.serverProcess = childProcess.execFile(`node`, [path.join(__dirname, `..`, `main.js`)], {
        env: process.env
      }, (error, stdout, stderr) => {
        // when server has been stopped

        if (error && !error.killed) {
          reject(error);
          return;
        }

        // save stdout and stderr so that they can be returned by stopServer()
        this.serverStdout = stdout;
        this.serverStderr = stderr;
      });

      // wait until server has started
      this.serverProcess.stdout.on(`data`, resolve);
    });
    await onServerData;
  }

  /**
   * Crawls the local deployment. Updates about crawled pages are given using events.
   * @returns {Promise} Promise that resolves as soon as the crawling has finished.
   */
  crawl() {
    return new Promise((resolve, reject) => {
      const siteChecker = new SiteChecker({
        excludeExternalLinks: true,
        filterLevel: 3,
        honorRobotExclusions: false,
        maxSocketsPerHost: 10,
        rateLimit: 25,

        excludedKeywords: [
          // form targets are not meant to be called without parameters / with GET instead of POST
          `http://localhost:5000/ajax/*`,

          // large fixtures shouldn't be tested twice
          `*?loadAllModes`,

          // Exports are excluded as they are no real pages and take too long to load.
          // They are tested by exports-valid script.
          ...exportPluginKeys.map(pluginKey => `${BASE_URL}*.${pluginKey}`)
        ]
      },
      {
        html: (tree, robots, response, pageUrl, customData) => {
          // HTML page successfully retrieved and rendered

          this.emit(`passingPage`, pageUrl);
        },
        junk: (result, customData) => {
          // new link on current HTML page discovered, but skipped

          if (!result.internal && result.url.resolved !== null) {
            this.emit(`externalLinkFound`, result.url.resolved);
          }
        },
        link: (result, customData) => {
          // new link on current HTML page discovered and fetched

          const allowedStatusCodes = [200, 301, 302];
          if (result.http.response !== null && !allowedStatusCodes.includes(result.http.response.statusCode)) {
            this.emit(`failingPage`, result.url.resolved, `${result.http.response.statusCode} ${result.http.response.statusMessage}`);
          }
          else if (result.broken) {
            this.emit(`failingPage`, result.url.resolved, result.brokenReason);
          }
        },
        page: (error, pageUrl, customData) => {
          // all links of current HTML page have been tested
          // this is also called if the first page errored

          if (error) {
            this.emit(`failingPage`, pageUrl, error);
          }
        },
        end: () => {
          resolve();
        }
      });

      siteChecker.enqueue(BASE_URL);
    });
  }

  /**
   * Kills the server process.
   * @returns {Promise.<Object>} Promise that resolves with stdout and stderr as soon as the server process is closed.
   */
  async stopServer() {
    const onServerClosed = new Promise((resolve, reject) => {
      this.serverProcess.on(`close`, resolve);
    });
    this.serverProcess.kill();
    await onServerClosed;

    return { stdout: this.serverStdout, stderr: this.serverStderr };
  }
}

module.exports = SiteCrawler;
