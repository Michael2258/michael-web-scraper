import puppeteer from "puppeteer"
import fs from "fs"
import axios from "axios"
import net from "net"

async function scrapeVideo(browser, videoUrl, index) {
  try {
    let page = await browser.newPage()
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 0 })

    await page.waitForSelector("video[mediatype=video]")

    let videoPath = await (
      await page.$("video[mediatype=video]")
    ).evaluate((node) => node.getAttribute("src"))

    await download(videoPath, index)

    await page.close()
  } catch (error) {
    console.log({ error })
  }
}

async function scrapeCreator(browser, username) {
  try {
    let page = await browser.newPage()
    await page.goto("http://tiktok.com/" + username, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    })

    await page.waitForSelector('div[data-e2e="user-post-item"] a')

    let links = await page.$$('div[data-e2e="user-post-item"] a')
    let index = 0

    for (const link of links) {
      try {
        index++
        const url = await link.evaluate((node) => node.getAttribute("href"))
        // videoLinks.push(await link.evaluate((node) => node.getAttribute("href")))
        await scrapeVideo(browser, url, index)
      } catch (error) {
        console.log({ error })
        continue
      }
    }

    await page.close()
  } catch (error) {
    console.log(error)
  }
}

async function findTopVideoCreators(browser, query) {
  try {
    let page = await browser.newPage()

    await page.goto("http://tiktok.com/", {
      waitUntil: "domcontentloaded",
      timeout: 0,
    })
    await page.waitForSelector("input[type=search]")

    let searchBox = await page.$("input[type=search]")
    await searchBox.type(query, { delay: 111 })
    await page.waitForTimeout(500) // we need to wait a bit before pressing enter
    await searchBox.press("Enter")

    await page.waitForSelector('a[data-e2e="search-user-info-container"]')

    let userLinks = []
    let links = await page.$$('a[data-e2e="search-user-info-container"]')
    for (const link of links) {
      userLinks.push(await link.evaluate((node) => node.getAttribute("href")))
    }

    await page.close()
    return userLinks
  } catch (error) {
    console.log({ error })
  }
}

async function download(path, idx) {
  try {
    console.log(path)
    await axios({
      method: "GET",
      url: path,
      responseType: "stream",
    })
      .then((response) => {
        return new Promise((resolve, reject) => {
          const fileName = `${idx}.mp4`
          const file = fs.createWriteStream(fileName)
          response.data.pipe(file)

          file.on("error", (error) => {
            console.log({ error })
            return reject(error)
          })

          file.on("finish", () => {
            console.log("Download done.")
            file.close()
          })

          file.on("close", () => {
            return resolve(fileName)
          })
        })
      })
      .catch((err) => {
        console.log(err)
      })
  } catch (error) {
    net
      .createServer((socket) => {
        socket.on("error", (err) => {
          console.log("Caught flash policy server socket error: ")
          console.log(err.stack)
        })

        socket.write('<?xml version="1.0"?>\n')
        socket.write(
          '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n'
        )
        socket.write("<cross-domain-policy>\n")
        socket.write('<allow-access-from domain="*" to-ports="*"/>\n')
        socket.write("</cross-domain-policy>\n")
        socket.end()
        socket.destroy()
      })
      .listen(843)
    console.log({ "Error download": error })
  }
}

async function run(query) {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [`--window-size=1920,1080`],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  })

  let creatorNames = await findTopVideoCreators(browser, query)

  console.log(creatorNames.slice(0, 3))

  await scrapeCreator(browser, creatorNames[0])

  await browser.close()
}

run("redvelvet_smtown")
