import {Mesh, VertexData} from "babylonjs"
import alea from "alea"
import {createNoise2D} from "simplex-noise"

const noise1 = createNoise2D(alea("seed1"))

/**
 * 
 * @param noiseFn 
 * @param {number} x 
 * @param {number} y 
 * @param {number} scale  
 * @param {number} octaves increase detail of terrain
 * @param {number} persistence controls frequency over time
 * @param {number} exponentiation controls the general height of terrain
 * @returns {number}
 */
 const fractionalBMotion = (
    noiseFn = noise1,
    x: number,
    y: number,
    scale: number,
    octaves: number,
    persistence: number,
    exponentiation: number
) => {
    const xs = x / scale
    const ys = y / scale
    let amplitude = 1.0
    let frequency = 1.0
    let normalization = 0
    let total = 0
    for (let octave = 0; octave < octaves; octave++) {
        total += noiseFn(xs * frequency, ys * frequency) * amplitude
        normalization += amplitude
        amplitude *= persistence
        frequency *= 2.0;
    }
    total /= normalization
    // negative base always returns NaN for some reason. need
    // to cast to positive then add negative sign back
    return total < 0 ? 
        -(Math.abs(total) ** exponentiation)
        : total ** exponentiation
}

export const enum voxel {
    air,
    stone,
    grass,
    dirt,
    water,
    sand,
    snow
}

const CHUNK_X_DIM = 16
const CHUNK_Z_DIM = 16
const CHUNK_Y_DIM = 128
const TERRAIN_MID = 50

const oceanLevel = ~~(CHUNK_Y_DIM * 0.25)
const beachLevel = oceanLevel + 4
const snowLevel = ~~(CHUNK_Y_DIM * 0.67)
const mountainLevel = ~~(CHUNK_Y_DIM * 0.48)

const biome = (elevation: number, moisture: number) => {
    if (elevation < beachLevel) {
        return voxel.sand
    } else if (elevation > snowLevel) {
        return voxel.snow
    } else if (elevation > mountainLevel) {
        if (moisture < 0.1) {
            return voxel.stone
        } else {
            return voxel.grass
        }
    } else {
        return voxel.grass
    }
}

type RawVoxelData = Int32Array

type n = number
const xaddr = (ptr: n, x: n) => ptr + (x * CHUNK_Z_DIM * CHUNK_Y_DIM)
const zaddr = (z: n, xAddress: n) => (z * CHUNK_Y_DIM) + xAddress
const yaddr = (y: n, zAddress: n) => y + zAddress
const voxaddr = (x: n, y: n, z: n, ptr: n) => yaddr(y, zaddr(z, xaddr(ptr, x)))
const elevationNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 200.0, 6.0, 0.4, 2.0)
const moistureNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 512.0, 4.0, 0.5, 4.0)
const generateHeight = (x: n, z: n) => Math.abs(~~(elevationNoise(x, z) * CHUNK_Y_DIM) + TERRAIN_MID)

const createTerrainGeometry = (
    indices: number[],
    vertices: number[],
    colors: number[],
    renderNegativeY: boolean,
    renderPositiveY: boolean,
    renderNegativeX: boolean,
    renderPositiveX: boolean,
    renderNegativeZ: boolean,
    renderPositiveZ: boolean,
    xGlobal: number,
    zGlobal: number,
    yGlobal: number,
    voxelType: number
) => {
    if (
        !renderNegativeY 
        && !renderPositiveY
        && !renderNegativeZ 
        && !renderPositiveZ
        && !renderNegativeX 
        && !renderPositiveX
    ) {
        return
    }

    const b = vertices.length / 3
    vertices.push(
        xGlobal + 0, yGlobal + 0, zGlobal + 0,
        xGlobal + 0, yGlobal + 0, zGlobal + 1,
        xGlobal + 1, yGlobal + 0, zGlobal + 0,
        xGlobal + 1, yGlobal + 0, zGlobal + 1,
        xGlobal + 0, yGlobal + 1, zGlobal + 0,
        xGlobal + 0, yGlobal + 1, zGlobal + 1,
        xGlobal + 1, yGlobal + 1, zGlobal + 0,
        xGlobal + 1, yGlobal + 1, zGlobal + 1
    )

    switch(voxelType) {
        case voxel.grass:
            colors.push(
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
                0.45, 1, 0.45, 1,
            )
            break
        case voxel.water:
            colors.push(
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
                0.3, 0.3, 1, 1,
            )
            break
        case voxel.dirt:
            colors.push(
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
                0.55, 0.15, 0.08, 1,
            )
            break
        case voxel.stone:
            colors.push(
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
                0.8, 0.8, 0.8, 1,
            )
            break
        case voxel.snow:
            colors.push(
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
                1.0, 1.0, 1.0, 1,
            )
            break
        case voxel.sand:
            colors.push(
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
                0.9, 0.87, 0.65, 1,
            )
            break
        default:
            colors.push(
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
                0, 1, 0, 1,
            )
            break
    }

    if (renderNegativeX) {
        indices.push(
            b + 0, b + 5, b + 1,
            b + 4, b + 5, b + 0,
        )
    }
    if (renderPositiveX) {
        indices.push(
            b + 2, b + 3, b + 7,
            b + 2, b + 7, b + 6,
        )
    }

    if (renderNegativeY) {
        indices.push(
            b + 0, b + 1, b + 2,
            b + 3, b + 2, b + 1,
        )
    }

    if (renderPositiveY) {
        indices.push(
            b + 4, b + 6, b + 5,
            b + 7, b + 5, b + 6,
        )
    }

    if (renderNegativeZ) {
        indices.push(
            b + 0, b + 2, b + 4,
            b + 4, b + 2, b + 6,
        )
    }
    
    if (renderPositiveZ) {
        indices.push(
            b + 1, b + 5, b + 3,
            b + 5, b + 7, b + 3,
        )
    }
}

interface VoxelChecker {
    isVoxelSolid: (x: number, y: number, z: number) => boolean
}

export class TerrainChunk {
    id: string
    vertexData: VertexData
    mesh: Mesh
    voxelPtr: number
    voxelData: RawVoxelData
    cachedOriginX: number
    cachedOriginZ: number
    globalRef: VoxelChecker
    isRendered: boolean

    constructor(
        id: string,
        voxelPtr: number,
        voxelData: RawVoxelData,
        globalRef: VoxelChecker
    ) {
        this.id = id
        this.voxelPtr = voxelPtr
        this.mesh = new Mesh(`terrain_chunk_${id}`)
        this.vertexData = new VertexData()
        this.voxelData = voxelData
        this.cachedOriginX = 0
        this.cachedOriginZ = 0
        this.globalRef = globalRef
        this.isRendered = false
    }

    generateVoxels(originX: number, originZ: number) {
        const {voxelPtr: ptr, voxelData} = this
        for (let x = 0; x < CHUNK_X_DIM; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originX + x
            for (let z = 0; z < CHUNK_Z_DIM; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originZ + z
                const calcHeight = generateHeight(xGlobal, zGlobal)
                const height = Math.max(calcHeight, 1)
                const moisture = moistureNoise(xGlobal, zGlobal)
                for (let y = 0; y < height; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelData[v] = biome(height, moisture)
                }
                // zero out the rest
                // think of a more efficent way later?
                for (let y = height; y < CHUNK_Y_DIM; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelData[v] = voxel.air
                }
            }
        }
        this.cachedOriginX = originX
        this.cachedOriginZ = originZ
        return 0
    }

    render() {
        const {
            cachedOriginX: originX, cachedOriginZ: originZ,
            voxelPtr: ptr, voxelData
        } = this
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        for (let x = 0; x < CHUNK_X_DIM; x++) {
            const xGlobal = originX + x
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIM; z++) {
                const zGlobal = originZ + z
                const zaddress = zaddr(z, xaddress)
                
                for (let y = 0; y < CHUNK_Y_DIM; y++) {
                    const v = yaddr(y, zaddress)
                    const type = voxelData[v]
                    if (type === voxel.air) {
                        continue
                    }

                    const renderNegativeY = (
                        y > 0 
                        && voxelData[v - 1] === voxel.air
                    )
                    const renderPositiveY = y > CHUNK_Y_DIM - 2
                        ? true
                        : voxelData[v + 1] === voxel.air

                    const renderNegativeX = x < 1 
                        ? !this.globalRef.isVoxelSolid(xGlobal - 1, y, zGlobal)
                        : voxelData[voxaddr(x - 1, y, z, ptr)] === voxel.air
                    const renderPositiveX = x > CHUNK_X_DIM - 2 
                        ? !this.globalRef.isVoxelSolid(xGlobal + 1, y, zGlobal)
                        : voxelData[voxaddr(x + 1, y, z, ptr)] === voxel.air

                    const renderNegativeZ = z < 1 
                        ? !this.globalRef.isVoxelSolid(xGlobal, y, zGlobal - 1)
                        : voxelData[voxaddr(x, y, z - 1, ptr)] === voxel.air
                    const renderPositiveZ = z > CHUNK_Z_DIM - 2 
                        ? !this.globalRef.isVoxelSolid(xGlobal, y, zGlobal + 1)
                        : voxelData[voxaddr(x, y, z + 1, ptr)] === voxel.air
                    
                    createTerrainGeometry(
                        indices, vertices, colors,
                        renderNegativeY, renderPositiveY,
                        renderNegativeX, renderPositiveX,
                        renderNegativeZ, renderPositiveZ,
                        xGlobal, zGlobal, y, type 
                    )
                }
            }
        }
        const {vertexData: vd, mesh} = this
        vd.indices = indices
        vd.positions = vertices
        vd.colors = colors
        vd.applyToMesh(mesh, true)
    }

    destroyMesh() {
        const name = this.mesh.name
        this.mesh.dispose()
        this.mesh = new Mesh(name)
    }
}

const distanceToChunk = (dist: number) => {
    let chunkCount = 0
    for (let i = 1; i < dist + 1; i++) {
        chunkCount += i * 8
    }
    const currentChunk = 1
    return chunkCount + currentChunk
}

type ChunkIndex = number

const enum chunk_encoding {
    null = -1
}

const chunkKey = (x: number, z: number) => x.toString() + "." + z.toString()

const boundNeg = (out: {pos: number, neg: number}, dim: number) => {
    out.neg = Math.max(out.neg - dim, 0)
    out.pos = out.neg + dim
    return out
}

const boundPos = (out: {pos: number, neg: number}, dim: number) => {
    out.neg = out.pos
    out.pos += dim
    return out
}

const enum invalidation {
    negativex = 1 << 0,
    positivex = 1 << 1,
    negativez = 1 << 2,
    positivez = 1 << 3,

    posx_posz = (0 | positivex | positivez),
    posx_negz = (0 | positivex | negativez),
    negx_posz = (0 | negativex | positivez),
    negx_negz = (0 | negativex | negativez)
}

const diffChunkBoundaries = (
    positivexBound: number,
    negativexBound: number,
    positivezBound: number,
    negativezBound: number,
    currentX: number,
    currentZ: number
) => {
    let flags = 0

    if (currentX > positivexBound) {
        flags |= invalidation.positivex
    } else if (currentX < negativexBound) {
        flags |= invalidation.negativex
    }

    if (currentZ > positivezBound) {
        flags |= invalidation.positivez
    } else if (currentZ < negativezBound) {
        flags |= invalidation.negativez
    }
    return flags
}


type RebuildQueue = {oldKey: string, newKey: string}[]
type AxisBoundary = {pos: number, neg: number}

const createRebuildChunkItems = (
    out: RebuildQueue,
    simulationQueue: RebuildQueue,
    targetAxis: AxisBoundary,
    alternateAxis: AxisBoundary,
    renderDistance: number,
    simulationDistance: number,
    chunksPerRow: number,
    simulationChunksPerRow: number,
    positiveAxis: boolean,
    targetAxisDimension: number,
    alternateAxisDimension: number,
    isTargetingX: boolean,
    targetAxisMax: number,
    alternateAxisMax: number
) => {
    const {neg, pos} = targetAxis
    const trailingBound = positiveAxis
        ? neg - targetAxisDimension * (renderDistance - 1)
        : neg - targetAxisDimension * renderDistance
    const leadingBound = positiveAxis 
        ? pos + targetAxisDimension * renderDistance
        : pos + targetAxisDimension * (renderDistance - 1)
    if (trailingBound < 1 || leadingBound >= targetAxisMax) {
        return out
    }
    const xkey = positiveAxis ?
        neg - targetAxisDimension * renderDistance
        : pos + targetAxisDimension * (renderDistance - 1) 
    const rebuildXkey = positiveAxis ? 
        pos + targetAxisDimension * renderDistance
        : neg - targetAxisDimension * (renderDistance + 1)
    const {min: startzkey} = calculateStartChunk(
        alternateAxis.neg,
        renderDistance,
        chunksPerRow,
        alternateAxisDimension,
        alternateAxisMax
    )

    const rowLen = chunksPerRow
    for (let i = 0; i < rowLen; i++) {
        const zkey = startzkey + i * alternateAxisDimension
        if (zkey >= alternateAxisMax) {
            break
        }
        const oldKey = isTargetingX 
            ? chunkKey(xkey, zkey) 
            : chunkKey(zkey, xkey)
        const newKey = isTargetingX 
            ? chunkKey(rebuildXkey, zkey) 
            : chunkKey(zkey, rebuildXkey)
        out.push({oldKey, newKey})
    }

    const trailingSimulation = trailingBound - targetAxisDimension
    const leadingSimulation = leadingBound + targetAxisDimension 
    if (trailingSimulation < 1 || leadingSimulation >= targetAxisMax) {
        return out
    }

    const simXKey = positiveAxis 
        ? xkey - targetAxisDimension
        : xkey + targetAxisDimension
    const simRebuildXKey = positiveAxis
        ? rebuildXkey + targetAxisDimension
        : rebuildXkey - targetAxisDimension
    const {min: simStartZKey} = calculateStartChunk(
        alternateAxis.neg,
        simulationDistance,
        simulationChunksPerRow,
        alternateAxisDimension,
        alternateAxisMax
    )
    const simRowLen = simulationChunksPerRow
    console.log("sim row len", simRowLen)
    for (let i = 0; i < simRowLen; i++) {
        const zkey = simStartZKey + i * alternateAxisDimension
        if (zkey >= alternateAxisMax) {
            console.log("zkey bound reached", zkey, "max", alternateAxisMax)
            break
        }
        const oldKey = isTargetingX 
            ? chunkKey(simXKey, zkey) 
            : chunkKey(zkey, simXKey)
        const newKey = isTargetingX 
            ? chunkKey(simRebuildXKey, zkey) 
            : chunkKey(zkey, simRebuildXKey)
        console.log("item", {oldKey, newKey})
        simulationQueue.push({oldKey, newKey})
    }

    return out
}

class Logger {
    name: string

    constructor(name: string) {
        this.name = name
    }

    get identity() {
        return `[${this.name}]:`
    }

    warn(...msgs: any[]) {
        console.warn(this.identity, ...msgs)
    }

    error(...msgs: any[]) {
        console.error(this.identity, ...msgs)
    }

    log(...msgs: any[]) {
        console.log(this.identity, ...msgs)
    }
    
    info(...msgs: any[]) {
        console.info(this.identity, ...msgs)
    }
}

const startChunkContainer = {min: 0, translation: 0}
const calculateStartChunk = (
    nearestBoundary: number,
    simulationDistance: number,
    totalSimulatedChunks: number,
    chunkDimension: number,
    axisLimit: number
) => {
    const axisMinReal = nearestBoundary - (simulationDistance * CHUNK_Z_DIM)
    const axisMinPreliminary = Math.max(axisMinReal, 0)
    const axisMaxReal = axisMinPreliminary + chunkDimension * totalSimulatedChunks
    const axisMax = axisMaxReal >= axisLimit ? axisLimit : axisMaxReal
    const axisMaxDiff = axisMaxReal - axisMax
    const min = axisMaxDiff > 0
        ? Math.max(0, axisMinPreliminary - axisMaxDiff)
        : axisMinPreliminary
    startChunkContainer.min = min
    startChunkContainer.translation = -axisMaxDiff
    return startChunkContainer
}

export class Chunks {
    chunks: TerrainChunk[]
    voxelBuffer: RawVoxelData
    renderDistance: number
    chunkCount: number
    chunksPerRow: number
    chunkMap: Record<string, ChunkIndex>
    nextXBoundary: AxisBoundary
    nextZBoundary: AxisBoundary
    rebuildQueue: RebuildQueue
    simulationQueue: RebuildQueue
    maxChunksX: number
    maxChunksZ: number
    maxX: number
    maxZ: number
    simulationDistance: number
    renderableChunksCount: number
    renderableChunksPerRow: number
    logger: Logger

    constructor({
        renderDistance = 1, 
        maxChunksX = 40, 
        maxChunksZ = 40,
    } = {}) {
        this.renderDistance = renderDistance
        this.simulationDistance = renderDistance + 1
        this.chunkCount = distanceToChunk(this.simulationDistance)
        this.renderableChunksCount = distanceToChunk(renderDistance)
        this.renderableChunksPerRow = Math.sqrt(this.renderableChunksCount)
        this.chunksPerRow = Math.sqrt(this.chunkCount)
        this.voxelBuffer = new Int32Array()
        this.chunks = []
        this.chunkMap = {}
        this.nextXBoundary = {neg: 0, pos: 0}
        this.nextZBoundary = {neg: 0, pos: 0}
        this.rebuildQueue = []
        this.simulationQueue = []
        this.maxChunksX = maxChunksX
        this.maxChunksZ = maxChunksZ
        this.maxX = maxChunksX * CHUNK_X_DIM
        this.maxZ = maxChunksZ * CHUNK_Z_DIM
        this.logger = new Logger("chunk manager")
    }

    init(originX: number, originZ: number) {
        const chunks = this.chunkCount
        if (chunks < 1) {
            this.logger.warn("initializing zero chunks!")
            return false
        }
        const {maxChunksX, maxChunksZ} = this
        const numberOfLoadedChunks = this.simulationDistance * 2 + 1
        if (
            numberOfLoadedChunks > maxChunksX 
            || numberOfLoadedChunks > maxChunksZ
        ) {
            this.logger.error("max chunks are less than simulated distance!")
            return false
        }
        const voxelChunkUnits = CHUNK_X_DIM * CHUNK_Y_DIM * CHUNK_Z_DIM
        const chunkBytes = voxelChunkUnits * Int32Array.BYTES_PER_ELEMENT
        const bytes = chunkBytes * chunks
        this.voxelBuffer = new Int32Array(bytes)
        // generate initial voxels
        const chunkGrid = this.chunksPerRow
        const {simulationDistance} = this
        const nearestXBoundary = originX - (originX % CHUNK_X_DIM)
        /*
        const nearestXBoundary = originX - (originX % CHUNK_X_DIM)
        const minXActual = nearestXBoundary - (simulationDistance * CHUNK_X_DIM)
        const minX = Math.max(minXActual, 0)
        */
        const {min: minX, translation: xTrans} = calculateStartChunk(
            nearestXBoundary,
            simulationDistance,
            chunkGrid,
            CHUNK_X_DIM,
            this.maxX
        ) 
        const nearestZBoundary = originZ - (originZ % CHUNK_Z_DIM)
        /*
        const minZActual = nearestZBoundary - (simulationDistance * CHUNK_Z_DIM)
        const minZprelim = Math.max(minZActual, 0)
        const maxZactual = minZprelim + CHUNK_Z_DIM * (chunkGrid - 1)
        const maxZ = maxZactual >= this.maxZ 
            ? this.maxZ
            : maxZactual
        const maxZdiff = maxZactual - maxZ
        const minZ = maxZdiff > 0
            ? Math.max(0, minZprelim - maxZdiff)
            : minZprelim
        */
        const {min: minZ, translation: zTrans} = calculateStartChunk(
            nearestZBoundary,
            simulationDistance,
            chunkGrid,
            CHUNK_Z_DIM,
            this.maxZ
        )
        console.log("minz", minZ, "limitz", this.maxZ, "trans_neg", zTrans)
        const {chunkMap} = this
        for (let x = 0; x < chunkGrid; x++) {
            for (let z = 0; z < chunkGrid; z++) {
                const id = (x * chunkGrid) + z
                const chunk = new TerrainChunk(
                    id.toString(), id * chunkBytes, 
                    this.voxelBuffer, this
                )
                const xOffset = minX + (x * CHUNK_X_DIM)
                const zOffset = minZ + (z * CHUNK_Z_DIM)
                //console.log("inited x", xOffset, "z", zOffset)
                chunk.generateVoxels(xOffset, zOffset)
                this.chunks.push(chunk)
                chunkMap[chunkKey(xOffset, zOffset)] = id
            }
        }
        console.log("nearx", nearestXBoundary, "nearz", nearestZBoundary)
        console.log("map", chunkMap)

        // render initially constructed voxel data
        // only get renderable chunks
        const {renderDistance} = this
        const renderXStart = Math.max(
            0, (nearestXBoundary - renderDistance * CHUNK_X_DIM) + xTrans + CHUNK_X_DIM
        )
        const renderZStart = Math.max(
            0, (nearestZBoundary - renderDistance * CHUNK_Z_DIM) + zTrans + CHUNK_Z_DIM
        )
        const renderableChunks = this.renderableChunksPerRow
        console.log("startx", renderXStart, "startz", renderZStart, "chunks", renderableChunks)
        for (let x = 0; x < renderableChunks; x++) {
            for (let z = 0; z < renderableChunks; z++) {
                const xkey = renderXStart + (x * CHUNK_X_DIM)
                const zkey = renderZStart + (z * CHUNK_Z_DIM)
                console.log("init render x", xkey, "z", zkey)
                const key = chunkKey(xkey, zkey)
                const id = chunkMap[key]
                if (id === undefined || id === chunk_encoding.null) {
                    console.warn(`one of the initialized chunks is missing! Skipping! missing => x=${xkey}, z=${zkey}`)
                    continue
                }
                const chunk = this.chunks[id]
                chunk.render()
                chunk.isRendered = true
            }
        }
        const {nextXBoundary, nextZBoundary} = this
        nextXBoundary.neg = nearestXBoundary
        nextXBoundary.pos = nearestXBoundary + CHUNK_X_DIM
        nextZBoundary.neg = nearestZBoundary
        nextZBoundary.pos = nearestZBoundary + CHUNK_Z_DIM
        return true
    }

    isVoxelSolid(x: number, y: number, z: number) {
        if (x < 0 || z < 0 || y < 0) {
            return true
        } else if (y >= CHUNK_Y_DIM) {
            return false
        }
        const intx = ~~(x)
        const intz = ~~(z)
        const inty = ~~(y)
        const xdiff = (intx % CHUNK_X_DIM)
        const zdiff = (intz % CHUNK_Z_DIM)
        const xOffset = intx - xdiff
        const zOffset = intz - zdiff
        const key = chunkKey(xOffset, zOffset)
        const chunkRef = this.chunkMap[key]
        if (
            chunkRef === undefined 
            || chunkRef === chunk_encoding.null
        ) {
            return true
        }
        const {voxelPtr, voxelData} = this.chunks[chunkRef]
        const v = voxaddr(xdiff, inty, zdiff, voxelPtr)
        const type = voxelData[v]
        return type !== voxel.air
    }

    diffChunks(currentX: number, currentZ: number) {
        const {
            nextXBoundary: nextX, nextZBoundary: nextZ
        } = this

        const diffFlags = diffChunkBoundaries(
            nextX.pos,
            nextX.neg,
            nextZ.pos,
            nextZ.neg,
            currentX,
            currentZ
        )
        switch (diffFlags) {
            case invalidation.negativex:
                console.log("rebuild pos x")
                this.rebuildQueue = createRebuildChunkItems(
                    this.rebuildQueue,
                    this.simulationQueue,
                    nextX,
                    nextZ,
                    this.renderDistance,
                    this.simulationDistance,
                    this.renderableChunksPerRow,
                    this.chunksPerRow,
                    false,
                    CHUNK_X_DIM,
                    CHUNK_Z_DIM,
                    true,
                    this.maxX,
                    this.maxZ,
                )
                this.nextXBoundary = boundNeg(nextX, CHUNK_X_DIM)
                break
            case invalidation.positivex:
                console.log("rebuild neg x")
                this.rebuildQueue = createRebuildChunkItems(
                    this.rebuildQueue,
                    this.simulationQueue,
                    nextX,
                    nextZ,
                    this.renderDistance,
                    this.simulationDistance,
                    this.renderableChunksPerRow,
                    this.chunksPerRow,
                    true,
                    CHUNK_X_DIM,
                    CHUNK_Z_DIM,
                    true,
                    this.maxX,
                    this.maxZ,
                )
                this.nextXBoundary = boundPos(nextX, CHUNK_X_DIM)
                break
            case invalidation.negativez:
                console.log("rebuild pos z")
                this.rebuildQueue = createRebuildChunkItems(
                    this.rebuildQueue,
                    this.simulationQueue,
                    nextZ,
                    nextX,
                    this.renderDistance,
                    this.simulationDistance,
                    this.renderableChunksPerRow,
                    this.chunksPerRow,
                    false,
                    CHUNK_Z_DIM,
                    CHUNK_X_DIM,
                    false,
                    this.maxZ,
                    this.maxX
                )
                this.nextZBoundary = boundNeg(nextZ, CHUNK_Z_DIM)
                break
            case invalidation.positivez:
                console.log("rebuild neg z")
                this.rebuildQueue = createRebuildChunkItems(
                    this.rebuildQueue,
                    this.simulationQueue,
                    nextZ,
                    nextX,
                    this.renderDistance,
                    this.simulationDistance,
                    this.renderableChunksPerRow,
                    this.chunksPerRow,
                    true,
                    CHUNK_Z_DIM,
                    CHUNK_X_DIM,
                    false,
                    this.maxZ,
                    this.maxX
                )
                this.nextZBoundary = boundPos(nextZ, CHUNK_Z_DIM)
                break
            default:
                console.log("no rebuilding neccessary")
                break
        }

        const {simulationQueue, rebuildQueue, chunkMap} = this
        // rebuild & render a maximum of one chunk
        // per frame.
        if (simulationQueue.length > 0) {
            const {oldKey, newKey} = simulationQueue[simulationQueue.length - 1]
            console.log("simulating", newKey, "in place of", oldKey)
            const chunkref = chunkMap[oldKey]
            const chunk = this.chunks[chunkref]
            const [xstr, zstr] = newKey.split(".")
            const x = parseInt(xstr, 10)
            const z = parseInt(zstr, 10)
            chunk.generateVoxels(x, z)
            chunkMap[oldKey] = chunk_encoding.null
            chunkMap[newKey] = chunkref
            if (simulationQueue.length < 2) {
                console.log("map", this.chunkMap)
            }
            simulationQueue.pop()
        } else if (rebuildQueue.length > 0) {
            const {oldKey, newKey} = rebuildQueue[rebuildQueue.length - 1]
            const oldChunkRef = chunkMap[oldKey]
            console.log("rendered", newKey, "in place of", oldKey)
            this.chunks[oldChunkRef].destroyMesh()
            const newChunkRef = chunkMap[newKey]
            this.chunks[newChunkRef].render()
            rebuildQueue.pop()
        }
    }
}
