import puppeteer from "puppeteer"
import fs from "fs"
import https from "https"
import { Readable } from "stream"
import fetch from "node-fetch"

// scrapes video details
async function scrapeVideo(browser, videoUrl) {
  try {
    let page = await browser.newPage()
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 0 })

    // wait for the page to load
    await page.waitForSelector("strong[data-e2e=like-count]")
    await page.waitForSelector("strong[data-e2e=comment-count]")
    await page.waitForSelector("div[data-e2e=browse-video-desc]")
    await page.waitForSelector("video[mediatype=video]")
    // await page.waitForSelector("h4[data-e2e=browse-video-music] a")

    let likes = await (
      await page.$("strong[data-e2e=like-count]")
    ).evaluate((node) => node.textContent)
    let comments = await (
      await page.$("strong[data-e2e=comment-count]")
    ).evaluate((node) => node.textContent)
    let desc = await (
      await page.$("div[data-e2e=browse-video-desc]")
    ).evaluate((node) => node.textContent)
    let videoPath = await (
      await page.$("video[mediatype=video]")
    ).evaluate((node) => node.getAttribute("src"))
    // let music = await (
    //   await page.$("h4[data-e2e=browse-video-music] a")
    // ).evaluate((node) => node.getAttribute("href"))

    await page.close()
    return { likes, comments, desc, videoPath }
  } catch (error) {
    console.log({ error })
  }
}

// scrapes user and their top 5 video details
async function scrapeCreator(browser, username) {
  try {
    let page = await browser.newPage()
    await page.goto("http://tiktok.com/" + username, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    })

    await page.waitForSelector('div[data-e2e="user-post-item"] a')
    await page.waitForSelector("strong[data-e2e=followers-count]")
    await page.waitForSelector("strong[data-e2e=likes-count]")

    // parse user data
    let followers = await (
      await page.$("strong[data-e2e=followers-count]")
    ).evaluate((node) => node.innerText)
    let likes = await (
      await page.$("strong[data-e2e=likes-count]")
    ).evaluate((node) => node.innerText)

    // parse user's video data
    let videoLinks = []
    let links = await page.$$('div[data-e2e="user-post-item"] a')
    for (const link of links) {
      videoLinks.push(await link.evaluate((node) => node.getAttribute("href")))
    }

    let videoData = await Promise.all(
      videoLinks.slice(0, 5).map((url) => scrapeVideo(browser, url))
    )
    await page.close()
    return { username, likes, followers, videoData }
  } catch (error) {
    console.log(error)
  }
}

// finds users of top videos of a given query
async function findTopVideoCreators(browser, query) {
  try {
    let page = await browser.newPage()
    // search for cat videos:
    await page.goto("http://tiktok.com/", {
      waitUntil: "domcontentloaded",
      timeout: 0,
    })
    await page.waitForSelector("input[type=search]")

    let searchBox = await page.$("input[type=search]")
    await searchBox.type(query, { delay: 111 })
    await page.waitForTimeout(500) // we need to wait a bit before pressing enter
    await searchBox.press("Enter")

    // wait for search results to load
    await page.waitForSelector('a[data-e2e="search-card-user-link"]')

    // find all user links
    let userLinks = []
    let links = await page.$$('a[data-e2e="search-card-user-link"]')
    for (const link of links) {
      userLinks.push(await link.evaluate((node) => node.getAttribute("href")))
    }

    await page.close()
    return userLinks
  } catch (error) {
    console.log({ error })
  }
}

function download(path, idx) {
  try {
    const read = fs.createWriteStream(`${idx}.mp4`)

    https.get(path, (stream) => {
      stream.pipe(read)
    })

    read.on("finish", () => {
      console.log("Done download.")
    })

    read.on("error", (err) => {
      reject(err)
    })
  } catch (error) {
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

  let creators = await Promise.all(
    creatorNames.slice(-1).map((url) => scrapeCreator(browser, url))
  )
  // console.log(JSON.stringify(creators, null, "  "))

  const paths = creators.map((i) => i.videoData)[0]
  let promises = []

  for (let i = 0; i < paths.length; i++) {
    // promises.push(download(paths[i]?.videoPath, i))

    download(paths[i]?.videoPath, i)
  }

  // Promise.all(promises).then(() => {
  //   console.log("Download done.")
  // })

  await browser.close()
}

// run scraper with cats!
run("#cats")
