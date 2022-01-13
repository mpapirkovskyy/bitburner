const settings = {
  homeRamReserved: 20,
  homeRamReservedBase: 20,
  homeRamExtraRamReserved: 12,
  homeRamBigMode: 64,
  minSecurityLevelOffset: 1,
  maxMoneyMultiplayer: 0.9,
  minSecurityWeight: 100,
  mapRefreshInterval: 2 * 60 * 60 * 1000,
  maxWeakenTime: 30 * 60 * 1000,
  keys: {
    serverMap: 'BB_SERVER_MAP',
  },
  changes: {
    hack: 0.002,
    grow: 0.004,
    weaken: 0.05,
  },
}

const mainHackScript = 'mainHack.js'
const playerServersScript = 'playerServers.js'
const spiderScript = 'spider.js'

const hackScript = 'hack.js'
const growScript = 'grow.js'
const weakenScript = 'weaken.js'

const hackPrograms = ['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe', 'HTTPWorm.exe', 'SQLInject.exe']
const hackScripts = [hackScript, growScript, weakenScript]

function getItem(key) {
  let item = localStorage.getItem(key)

  return item ? JSON.parse(item) : undefined
}

function setItem(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function getPlayerDetails(ns) {
  let portHacks = 0

  hackPrograms.forEach((hackProgram) => {
    if (ns.fileExists(hackProgram, 'home')) {
      portHacks += 1
    }
  })

  return {
    hackingLevel: ns.getHackingLevel(),
    portHacks,
  }
}

function convertMSToHHMMSS(ms = 0) {
  if (ms <= 0) {
    return '00:00:00'
  }

  if (!ms) {
    ms = new Date().getTime()
  }

  return new Date(ms).toISOString().substr(11, 8)
}

function localeHHMMSS(ms = 0) {
  if (!ms) {
    ms = new Date().getTime()
  }

  return new Date(ms).toLocaleTimeString()
}

function numberWithCommas(x) {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',')
}

function createUUID() {
  var dt = new Date().getTime()
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (dt + Math.random() * 16) % 16 | 0
    dt = Math.floor(dt / 16)
    return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
  return uuid
}

function weakenCyclesForGrow(growCycles) {
  return Math.max(0, Math.ceil(growCycles * (settings.changes.grow / settings.changes.weaken)))
}

function weakenCyclesForHack(hackCycles) {
  return Math.max(0, Math.ceil(hackCycles * (settings.changes.hack / settings.changes.weaken)))
}

/** @param {import(".").NS } ns */
async function getHackableServers(ns, servers) {
  const playerDetails = getPlayerDetails(ns)

  const hackableServers = Object.keys(servers)
    .filter((hostname) => ns.serverExists(hostname))
    .filter((hostname) => servers[hostname].ports <= playerDetails.portHacks || ns.hasRootAccess(hostname))

  for (const hostname of hackableServers) {
    if (hostname === 'home') continue;
    if (!ns.hasRootAccess(hostname)) {
      hackPrograms.forEach((hackProgram) => {
        if (ns.fileExists(hackProgram, 'home')) {
          ns[hackProgram.split('.').shift().toLocaleLowerCase()](hostname)
        }
      })
      ns.nuke(hostname)
    }

    await ns.scp(hackScripts, hostname)

  }

  hackableServers.sort((a, b) => servers[a].ram - servers[b].ram)
  return hackableServers
}

/** @param {import(".").NS } ns */
function findTargetServer(ns, serversList, servers, serverExtraData) {
  const playerDetails = getPlayerDetails(ns)

  serversList = serversList
    .filter((hostname) => servers[hostname].hackingLevel <= playerDetails.hackingLevel)
    .filter((hostname) => servers[hostname].maxMoney)
    .filter((hostname) => hostname !== 'home')
    .filter((hostname) => ns.getWeakenTime(hostname) < settings.maxWeakenTime)

  let weightedServers = serversList.map((hostname) => {
    const fullHackCycles = Math.ceil(0.8 / Math.max(0.00000001, ns.hackAnalyze(hostname)) / ns.hackAnalyzeChance(hostname))
    const halfHackThreads = Math.floor(0.5 / Math.max(0.00000001, ns.hackAnalyze(hostname)))
    const growThreads =  Math.ceil(ns.growthAnalyze(hostname, 2.5))

    serverExtraData[hostname] = {
      fullHackCycles,
      halfHackThreads,
      growThreads
    }

    const weakenTime = ns.getWeakenTime(hostname) 
    // TODO serverValue is not ideal, need adjustment, needs to account minSecurity instead of current
    // const serverValue = servers[hostname].maxMoney * (settings.minSecurityWeight / (servers[hostname].minSecurityLevel + ns.getServerSecurityLevel(hostname)))
    const serverValue = servers[hostname].maxMoney / (halfHackThreads + growThreads) / servers[hostname].minSecurityLevel

    return {
      hostname,
      serverValue,
      minSecurityLevel: servers[hostname].minSecurityLevel,
      securityLevel: ns.getServerSecurityLevel(hostname),
      weakenTime: weakenTime,
      maxMoney: servers[hostname].maxMoney,
    }
  })

  weightedServers.sort((a, b) => b.serverValue - a.serverValue)
  ns.print(JSON.stringify(weightedServers, null, 2))

  return weightedServers.map((server) => server.hostname)
}

/** @param {import(".").NS } ns */
export async function main(ns) {

  const hackRam = ns.getScriptRam(hackScript)
  const growRam = ns.getScriptRam(growScript)
  const weakenRam = ns.getScriptRam(weakenScript)

  ns.tprint(`Starting mainHack.js`)

  let hostname = ns.getHostname()

  if (hostname !== 'home') {
    throw new Exception('Run the script from home')
  }

  while (true) {
    const serverExtraData = {}
    const serverMap = getItem(settings.keys.serverMap)
    if (serverMap.servers.home.ram >= settings.homeRamBigMode) {
      settings.homeRamReserved = settings.homeRamReservedBase + settings.homeRamExtraRamReserved
    }

    if (!serverMap || serverMap.lastUpdate < new Date().getTime() - settings.mapRefreshInterval) {
      ns.tprint(`Spawning spider.js`)
      ns.spawn(spiderScript, 1, mainHackScript)
      ns.exit()
      return
    }
    serverMap.servers.home.ram = Math.max(0, serverMap.servers.home.ram - settings.homeRamReserved)


    const allServers = await getHackableServers(ns, serverMap.servers)
    const hackableServers = allServers.filter((s) => serverMap.servers[s].ram >= 2)


    let hackCycles = 0
    let growCycles = 0
    let weakenCycles = 0

    for (let i = 0; i < hackableServers.length; i++) {
      const server = serverMap.servers[hackableServers[i]]
      hackCycles += Math.floor(server.ram / hackRam)
      growCycles += Math.floor(server.ram / growRam)
    }
    weakenCycles = growCycles

    serverExtraData["hackCycles"] = hackCycles

    const targetServers = findTargetServer(ns, allServers, serverMap.servers, serverExtraData)
    const bestTarget = targetServers.shift()

    const hackTime = ns.getHackTime(bestTarget)
    const growTime = ns.getGrowTime(bestTarget)
    const weakenTime = ns.getWeakenTime(bestTarget)

    const growDelay = Math.max(0, weakenTime - growTime - 15 * 1000)
    const hackDelay = Math.max(0, growTime + growDelay - hackTime - 15 * 1000)

    const securityLevel = ns.getServerSecurityLevel(bestTarget)
    const money = ns.getServerMoneyAvailable(bestTarget)

    let action = 'weaken'
    if (securityLevel > serverMap.servers[bestTarget].minSecurityLevel + settings.minSecurityLevelOffset) {
      action = 'weaken'
    } else if (money < serverMap.servers[bestTarget].maxMoney * settings.maxMoneyMultiplayer) {
      action = 'grow'
    } else {
      action = 'hack'
    }

    ns.tprint(
      `Selected ${bestTarget} for a target. Planning to ${action} the server. Will wake up around ${localeHHMMSS(
        new Date().getTime() + weakenTime + 300
      )}`
    )
    ns.tprint(
      `Stock values: baseSecurity: ${serverMap.servers[bestTarget].baseSecurityLevel}; minSecurity: ${serverMap.servers[bestTarget].minSecurityLevel
      }; maxMoney: $${numberWithCommas(parseInt(serverMap.servers[bestTarget].maxMoney, 10))}`
    )
    ns.tprint(`Current values: security: ${Math.floor(securityLevel * 1000) / 1000}; money: $${numberWithCommas(parseInt(money, 10))}`)
    ns.tprint(
      `Time to: hack: ${convertMSToHHMMSS(hackTime)}; grow: ${convertMSToHHMMSS(growTime)}; weaken: ${convertMSToHHMMSS(weakenTime)}`
    )
    ns.tprint(`Delays: ${convertMSToHHMMSS(hackDelay)} for hacks, ${convertMSToHHMMSS(growDelay)} for grows`)

    if (action === 'weaken') {
      if (settings.changes.weaken * weakenCycles > securityLevel - serverMap.servers[bestTarget].minSecurityLevel) {
        weakenCycles = Math.ceil((securityLevel - serverMap.servers[bestTarget].minSecurityLevel) / settings.changes.weaken)
        growCycles -= weakenCycles
        growCycles = Math.max(0, growCycles)

        weakenCycles += weakenCyclesForGrow(growCycles)
        growCycles -= weakenCyclesForGrow(growCycles)
        growCycles = Math.max(0, growCycles)
      } else {
        growCycles = 0
      }

      ns.tprint(
        `Cycles ratio: ${growCycles} grow cycles; ${weakenCycles} weaken cycles; expected security reduction: ${Math.floor(settings.changes.weaken * weakenCycles * 1000) / 1000
        }`
      )

      for (let i = 0; i < hackableServers.length; i++) {
        const server = serverMap.servers[hackableServers[i]]
        let cyclesFittable = Math.max(0, Math.floor(server.ram / 1.75))
        const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles))
        

        if (growCycles) {
          ns.exec(growScript, server.host, cyclesToRun, bestTarget, cyclesToRun, growDelay, createUUID())
          growCycles -= cyclesToRun
          cyclesFittable -= cyclesToRun
        }

        if (cyclesFittable) {
          ns.exec(weakenScript, server.host, cyclesFittable, bestTarget, cyclesFittable, 0, createUUID())
          weakenCycles -= cyclesFittable
        }
      }
    } else if (action === 'grow') {
      weakenCycles = weakenCyclesForGrow(growCycles)
      growCycles -= weakenCycles

      ns.tprint(`Cycles ratio: ${growCycles} grow cycles; ${weakenCycles} weaken cycles`)

      for (let i = 0; i < hackableServers.length; i++) {
        const server = serverMap.servers[hackableServers[i]]
        let cyclesFittable = Math.max(0, Math.floor(server.ram / 1.75))
        const cyclesToRun = Math.max(0, Math.min(cyclesFittable, growCycles))

        if (growCycles) {
          ns.exec(growScript, server.host, cyclesToRun, bestTarget, cyclesToRun, growDelay, createUUID())
          growCycles -= cyclesToRun
          cyclesFittable -= cyclesToRun
        }

        if (cyclesFittable) {
          ns.exec(weakenScript, server.host, cyclesFittable, bestTarget, cyclesFittable, 0, createUUID())
          weakenCycles -= cyclesFittable
        }
      }
    } else {



      if (hackCycles > serverExtraData[bestTarget].fullHackCycles) {
        hackCycles = serverExtraData[bestTarget].fullHackCycles

        // if (hackCycles * 100 < growCycles) {
        //   hackCycles *= 10
        // }

        growCycles = Math.max(0, growCycles - Math.ceil((hackCycles * 1.7) / 1.75))

        weakenCycles = weakenCyclesForGrow(growCycles) + weakenCyclesForHack(hackCycles)
        growCycles -= weakenCycles
        hackCycles -= Math.ceil((weakenCyclesForHack(hackCycles) * 1.75) / 1.7)

        growCycles = Math.max(0, growCycles)
      } else {
        growCycles = 0
        weakenCycles = weakenCyclesForHack(hackCycles)
        hackCycles -= Math.ceil((weakenCycles * 1.75) / 1.7)
      }

      ns.tprint(`Cycles ratio: ${hackCycles} hack cycles; ${growCycles} grow cycles; ${weakenCycles} weaken cycles`)

      var hackBatch = Math.max(1, Math.ceil(hackCycles/100))

      for (let i = 0; i < hackableServers.length; i++) {
        const server = serverMap.servers[hackableServers[i]]
        let cyclesFittable = Math.max(0, Math.floor(server.ram / 1.7))
        const cyclesToRun = Math.max(0, Math.min(cyclesFittable, hackCycles))

        if (hackCycles) {
          var remaining = cyclesToRun

          while(remaining){
            var batch = Math.min(hackBatch, remaining)
            ns.exec(hackScript, server.host, batch, bestTarget, batch, hackDelay, createUUID())
            remaining -= batch
          }
          
          hackCycles -= cyclesToRun
          cyclesFittable -= cyclesToRun
        }

        const freeRam = server.ram - cyclesToRun * 1.7
        cyclesFittable = Math.max(0, Math.floor(freeRam / 1.75))

        if (cyclesFittable && growCycles) {
          const growCyclesToRun = Math.min(growCycles, cyclesFittable)

          ns.exec(growScript, server.host, growCyclesToRun, bestTarget, growCyclesToRun, growDelay, createUUID())
          growCycles -= growCyclesToRun
          cyclesFittable -= growCyclesToRun
        }

        if (cyclesFittable) {
          ns.exec(weakenScript, server.host, cyclesFittable, bestTarget, cyclesFittable, 0, createUUID())
          weakenCycles -= cyclesFittable
        }
      }
    }

    await ns.sleep(weakenTime + 300)
  }
}