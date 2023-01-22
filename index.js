import puppeteer from "puppeteer"
import fs from "fs"
import axios from "axios"
import net from "net"
import { tiktokdownload } from "tiktok-scraper-without-watermark"

async function logger(logs) {
  try {
    const logFilePath = process.cwd() + "/debug.log"

    if (await checkFileExist(logFilePath)) {
      await fs.promises.appendFile(logFilePath, logs + "\n")
    } else {
      const logStream = fs.createWriteStream(logFilePath)
      logStream.write(logs + "\n")
      logStream.end("Done logging.")
    }
  } catch (error) {
    console.log(`Error while logging. ${error}`)
  }
}

async function checkFileExist(filePath) {
  try {
    return fs.promises
      .access(filePath, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false)
  } catch (error) {
    await logger(`Error while checking file exist. ${error}`)
  }
}

async function scrapeVideo(browser, videoUrl, index) {
  try {
    const isExist = await checkFileExist(`${index}.mp4`)
    if (isExist) {
      await logger(`File ${index}.mp4 has already existed.`)
      return
    }

    let page = await browser.newPage()
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 0 })

    await page.waitForSelector("video[mediatype=video]")

    await downloadNoWM(videoUrl, index)
    await page.close()

    const isExistAfterDownloading = await checkFileExist(`${index}.mp4`)

    if (isExistAfterDownloading) return

    await logger(`Re-download file ${idx}.mp4...`)
    await scrapeVideo(browser, videoUrl, index)
  } catch (error) {
    await logger(`Error while scraping video. ${error}`)
  }
}

async function scrapeCreator(browser, username) {
  try {
    let page = await browser.newPage()
    await page.goto("http://tiktok.com/" + username, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    })

    await page.setViewport({
      width: 1200,
      height: 800,
    })

    await autoScroll(page)

    await page.waitForSelector('div[data-e2e="user-post-item"] a')

    let links = await page.$$('div[data-e2e="user-post-item"] a')

    let index = 0

    for (const link of links) {
      try {
        index++

        const url = await link.evaluate((node) => node.getAttribute("href"))
        await scrapeVideo(browser, url, index)
      } catch (error) {
        continue
      }
    }

    await page.close()
  } catch (error) {
    await logger(`Error while scraping creator. ${error}`)
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0
      var distance = 100
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight
        window.scrollBy({
          left: 0,
          top: distance,
          behavior: "smooth",
        })
        totalHeight += distance

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 400)
    })
  })
}

async function findTopCreators(browser, query) {
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
    await logger(`Error while finding top creators. ${error}`)
  }
}

async function downloadNoWM(path, idx) {
  try {
    const result = await tiktokdownload(path)

    if (result) {
      await download(result.nowm, idx)
    }
  } catch (error) {
    await logger(
      `Error while downloading video without Watermark: ${idx}.mp4 - path ${path}. ${error}`
    )
  }
}

async function download(path, idx) {
  try {
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
    await logger(`Error while downloading video. ${error}`)
  }
}

async function run(query) {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [`--window-size=1920,1080`],
    defaultViewport: {
      width: 1200,
      height: 800,
    },
  })

  let creatorNames = await findTopCreators(browser, query)

  console.log(creatorNames.slice(0, 3))

  await scrapeCreator(browser, creatorNames[0])

  await browser.close()
}

run("redvelvet_smtown")
