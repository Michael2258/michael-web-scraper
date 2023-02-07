import puppeteer from "puppeteer"
import fs from "fs"
import axios from "axios"
import net from "net"
import { tiktokdownload } from "tiktok-scraper-without-watermark"
import path from "path"

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

async function scrapeVideo(browser, videoUrl, directory) {
  let page = await browser.newPage()

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 0 })

    await page.waitForSelector('[data-e2e="browser-nickname"]')

    const videoId = videoUrl.toString().split("/")[
      videoUrl.toString().split("/").length - 1
    ]

    const videoIdInBinary = BigInt(videoId).toString(2)
    const videoIdInBinary32LeftMost = videoIdInBinary.substring(0, 31)
    const unixTimestampInSecond = parseInt(videoIdInBinary32LeftMost, 2)
    const createdDate = new Date(unixTimestampInSecond * 1000)

    const fileName = `${
      createdDate.getDate() +
      "-" +
      createdDate.getMonth() +
      "-" +
      createdDate.getFullYear() +
      "_" +
      createdDate.getHours() +
      "-" +
      createdDate.getMinutes() +
      "-" +
      createdDate.getSeconds()
    }.mp4`

    const isExist = await checkFileExist(`${directory}/${fileName}`)
    if (isExist) {
      await logger(`File ${fileName} has already existed.`)
      return
    }
    await page.waitForSelector("video[mediatype=video]")

    // const filePath = path.join(directory, fileName)

    await downloadNoWM(videoUrl, `${directory}/${fileName}`)
    await page.close()

    const isExistAfterDownloading = await checkFileExist(
      `${directory}/${fileName}`
    )

    if (isExistAfterDownloading) return

    await logger(`Re-download file ${fileName}...`)
    await scrapeVideo(browser, videoUrl, directory)
  } catch (error) {
    await page.close()
    await logger(`Error while scraping video. ${error}`)
  }
}

async function scrapeCreator(browser, username, directory) {
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

    for (const link of links) {
      try {
        const url = await link.evaluate((node) => node.getAttribute("href"))
        await scrapeVideo(browser, url, directory)
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

async function downloadNoWM(path, fileNameWithFolder) {
  try {
    const result = await tiktokdownload(path)

    if (result) {
      await download(result.nowm, fileNameWithFolder)
    }
  } catch (error) {
    await logger(
      `Error while downloading video without Watermark: ${fileNameWithFolder} - path ${path}. ${error}`
    )
  }
}

async function download(path, fileNameWithFolder) {
  try {
    await axios({
      method: "GET",
      url: path,
      responseType: "stream",
    })
      .then((response) => {
        return new Promise((resolve, reject) => {
          const fileName = fileNameWithFolder
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

  const dir = `./${creatorNames[0]}`

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }

  await scrapeCreator(browser, creatorNames[0], dir)

  await browser.close()
}

run("@username")
