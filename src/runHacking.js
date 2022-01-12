const mainHackScript = 'mainHack.js'
const playerServersScript = 'playerServers.js'
const spiderScript = 'spider.js'

function localeHHMMSS(ms = 0) {
  if (!ms) {
    ms = new Date().getTime()
  }

  return new Date(ms).toLocaleTimeString()
}



export async function main(ns) {
  ns.tprint(`Starting runHacking.js`)

  let hostname = ns.getHostname()

  if (hostname !== 'home') {
    throw new Exception('Run the script from home')
  }

  const homeRam = ns.getServerRam('home').shift()

  if (homeRam >= 32) {
    ns.tprint(`Spawning ${spiderScript}`)
    await ns.run(spiderScript, 1, mainHackScript)
    await ns.sleep(3000)
    ns.tprint(`Spawning ${playerServersScript}`)
    ns.spawn(playerServersScript, 1)
  } else {
    ns.tprint(`Spawning ${spiderScript}`)
    ns.spawn(spiderScript, 1, mainHackScript)
  }
}
