import {Mesh, VertexData} from "babylonjs"
import alea from "alea"
import {createNoise2D} from "simplex-noise"

const noise1 = createNoise2D(alea("seed1"))
const noise2 = createNoise2D(alea("seed2"))

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

const CHUNK_SIZE = 128

const voxelMaxHeight = 128
const oceanLevel = ~~(voxelMaxHeight * 0.25)
const beachLevel = oceanLevel + 4
const snowLevel = ~~(voxelMaxHeight * 0.67)
const mountainLevel = ~~(voxelMaxHeight * 0.48)

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

const LOADED_CHUNKS = 7
const X_BIAS = CHUNK_SIZE * CHUNK_SIZE * LOADED_CHUNKS
const Z_BIAS = CHUNK_SIZE
const VOXELS_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE
const SIZEOF_VOXEL = 2
const TERRAIN_MID = 50
const CHUNK_BUFFER_SIZE = VOXELS_PER_CHUNK * SIZEOF_VOXEL

class Chunk {
    voxelBuffer: Int32Array
    mesh: Mesh
    x: number
    y: number
    z: number
    vPtr: number
    vertexData: VertexData
    id: number
    xGrid: number
    zGrid: number
    absoluteOffset: number

    constructor({
        id, x, y, z, voxBuf, xGrid, zGrid
    }: {
        x: number, 
        y: number, 
        z: number,
        voxBuf: SharedArrayBuffer,
        id: number,
        xGrid: number,
        zGrid: number
    }) {
        this.id = id
        this.voxelBuffer = new Int32Array(voxBuf)
        this.mesh = new Mesh("rand")
        this.x = x
        this.y = y
        this.z = z
        this.vPtr = 0
        this.vertexData = new VertexData()
        this.xGrid = xGrid
        this.zGrid = zGrid
    }

    voxel(x: number, y: number, z: number) {
        this.vPtr = (x * X_BIAS + z * Z_BIAS + y) * SIZEOF_VOXEL
        return this
    }

    get active () {
        return Boolean(this.voxelBuffer[this.vPtr + 1])
    }

    set active(a: boolean) {
        this.voxelBuffer[this.vPtr + 1] = Number(a)
    }

    get type() {
        return this.voxelBuffer[this.vPtr]
    }

    set type(t: number) {
        this.voxelBuffer[this.vPtr] = t
    }

    init() {
        const xBase = this.x
        const zBase = this.z
        const xGrid = this.xGrid
        const zGrid = this.zGrid
        for (let x = 0; x < CHUNK_SIZE; x++) {
            const xReal = xBase + x
            const xG = xGrid + x
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const zReal = zBase + z
                const zG = zGrid + z
                const elevation = fractionalBMotion(
                    noise1, xReal, zReal, 200.0, 6.0, 0.4, 2.00
                )
                const height = Math.abs(~~(elevation * 128.0) + TERRAIN_MID)
                const moisture = fractionalBMotion(
                    noise2, xReal, zReal, 512.0, 4.0, 0.5, 4.0
                )
                for (let y = 0; y < height; y++) {
                    const v = this.voxel(xG, y, zG)
                    v.active = true
                    v.type = biome(height, moisture)
                }
                /* water generation => do later
                for (let y = height; y < oceanLevel; y++) {
                    const v = this.voxel(x, y, z)
                    v.active = true
                    v.type = voxel.water
                }
                */
            }
        }
        return this
    }

    render() {
        const xBase = this.x
        const yBase = this.y
        const zBase = this.z
        const xGrid = this.xGrid
        const zGrid = this.zGrid
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        for (let x = 0; x < CHUNK_SIZE; x++) {
            const xG = xGrid + x
            const xReal = xBase + x
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const zG = zGrid + z
                const zReal = zBase + z
                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const {active, type} = this.voxel(xG, y, zG)
                    if (!active) {
                        continue
                    }

                    const renderNegativeX = !this.voxel(xG - 1, y, zG).active
                    const renderPositiveX = !this.voxel(xG + 1, y, zG).active
                    const renderNegativeY = y > 0 && !this.voxel(xG, y - 1, zG).active
                    const renderPositiveY = y < CHUNK_BUFFER_SIZE - 2 && !this.voxel(xG, y + 1, zG).active
                    const renderNegativeZ = !this.voxel(xG, y, zG - 1).active
                    const renderPositiveZ = !this.voxel(xG, y, zG + 1).active

                    if (
                        !renderNegativeX && !renderPositiveX
                        && !renderNegativeY && !renderPositiveY
                        && !renderNegativeZ && !renderPositiveZ
                    ) {
                        continue
                    }

                    
                    const yReal = yBase + y
                    const b = vertices.length / 3
                    vertices.push(
                        xReal + 0, yReal + 0, zReal + 0,
                        xReal + 0, yReal + 0, zReal + 1,
                        xReal + 1, yReal + 0, zReal + 0,
                        xReal + 1, yReal + 0, zReal + 1,
                        xReal + 0, yReal + 1, zReal + 0,
                        xReal + 0, yReal + 1, zReal + 1,
                        xReal + 1, yReal + 1, zReal + 0,
                        xReal + 1, yReal + 1, zReal + 1
                    )
                    switch(type) {
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
            }
        }
        const vertexData = this.vertexData
        vertexData.indices = indices
        vertexData.positions = vertices
        vertexData.colors = colors
        this.mesh.dispose()
        const mesh = new Mesh(`chunk[${this.x.toString()}][${this.y.toString()}][${this.z.toString()}]`)
        vertexData.applyToMesh(mesh, true)
        this.mesh = mesh
        return this
    }
}

const CHUNK_X_DIM = 128
const CHUNK_Y_DIM = 128
const CHUNK_Z_DIM = 128

type RawVoxelData = Int32Array

type n = number
const xaddr = (ptr: n, x: n) => ptr + (x * CHUNK_Z_DIM * CHUNK_Y_DIM)
const zaddr = (z: n, xAddress: n) => (z * CHUNK_Y_DIM) + xAddress
const yaddr = (y: n, zAddress: n) => y + zAddress
const voxaddr = (x: n, y: n, z: n, ptr: n) => yaddr(y, zaddr(z, xaddr(ptr, x)))

export class TerrainChunk {
    id: string
    vertexData: VertexData
    mesh: Mesh
    voxelPtr: number
    voxelData: RawVoxelData
    cachedOriginX: number
    cachedOriginZ: number

    constructor(
        id: string,
        voxelPtr: number,
        voxelData: RawVoxelData
    ) {
        this.id = id
        this.voxelPtr = voxelPtr
        this.mesh = new Mesh(`terrain_chunk_${id}`)
        this.vertexData = new VertexData()
        this.voxelData = voxelData
        this.cachedOriginX = 0
        this.cachedOriginZ = 0
    }

    generateVoxels(originX: number, originZ: number) {
        const {voxelPtr: ptr, voxelData} = this
        for (let x = 0; x < CHUNK_X_DIM; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originX + x
            for (let z = 0; z < CHUNK_Z_DIM; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originZ + z
                const elevation = fractionalBMotion(
                    noise1, xGlobal, zGlobal, 200.0, 6.0, 0.4, 2.00
                )
                const height = Math.abs(~~(elevation * 128.0) + TERRAIN_MID)
                const moisture = fractionalBMotion(
                    noise2, xGlobal, zGlobal, 512.0, 4.0, 0.5, 4.0
                )
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

                    const e =  CHUNK_Y_DIM - 2
                    const renderNegativeY = y > 0 && voxelData[v - 1] === voxel.air
                    const renderPositiveY = y < e && voxelData[v + 1] === voxel.air

                    const d = CHUNK_X_DIM - 2
                    const renderNegativeX = x > 0 && voxelData[voxaddr(x - 1, y, z, ptr)] === voxel.air
                    const renderPositiveX = x < d && voxelData[voxaddr(x + 1, y, z, ptr)] === voxel.air

                    const c = CHUNK_Z_DIM - 2
                    const renderNegativeZ = z > 0 && voxelData[voxaddr(x, y, z - 1, ptr)] === voxel.air
                    const renderPositiveZ = z < c && voxelData[voxaddr(x, y, z + 1, ptr)] === voxel.air
                    
                    if (
                        !renderNegativeY 
                        && !renderPositiveY
                        && !renderNegativeZ 
                        && !renderPositiveZ
                        && !renderNegativeX 
                        && !renderPositiveX
                    ) {
                        continue
                    }

                    const b = vertices.length / 3
                    vertices.push(
                        xGlobal + 0, y + 0, zGlobal + 0,
                        xGlobal + 0, y + 0, zGlobal + 1,
                        xGlobal + 1, y + 0, zGlobal + 0,
                        xGlobal + 1, y + 0, zGlobal + 1,
                        xGlobal + 0, y + 1, zGlobal + 0,
                        xGlobal + 0, y + 1, zGlobal + 1,
                        xGlobal + 1, y + 1, zGlobal + 0,
                        xGlobal + 1, y + 1, zGlobal + 1
                    )

                    switch(type) {
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
            }
        }
        const {vertexData: vd, mesh} = this
        vd.indices = indices
        vd.positions = vertices
        vd.colors = colors
        vd.applyToMesh(mesh, true)
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

const createRebuildChunkItemsX = (
    out: RebuildQueue,
    targetAxis: AxisBoundary,
    alternateAxis: AxisBoundary,
    renderDistance: number,
    chunksPerRow: number,
    positiveAxis: boolean,
    targetAxisDimension: number,
    alternateAxisDimension: number,
    isTargetingX = true
) => {
    const {neg, pos} = targetAxis
    const trailingBound = positiveAxis
        ? neg - targetAxisDimension * (renderDistance - 1)
        : neg - targetAxisDimension * renderDistance
    if (trailingBound < 1) {
        return out
    }
    const xkey = positiveAxis ?
        neg - targetAxisDimension * renderDistance
        : pos + targetAxisDimension * (renderDistance - 1) 
    const rebuildXkey = positiveAxis ? 
        pos + targetAxisDimension * renderDistance
        : neg - targetAxisDimension * (renderDistance + 1)
    const startzkey = alternateAxis.neg < 1 ? 
        0 : Math.max(
            alternateAxis.neg - renderDistance * alternateAxisDimension, 
            0
        )
    const rowLen = chunksPerRow
    for (let i = 0; i < rowLen; i++) {
        const zkey = startzkey + i * alternateAxisDimension
        const oldKey = isTargetingX ? chunkKey(xkey, zkey) : chunkKey(zkey, xkey)
        const newKey = isTargetingX ? chunkKey(rebuildXkey, zkey) : chunkKey(zkey, rebuildXkey)
        out.push({oldKey, newKey})
    }
    return out
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

    constructor(
        renderDistance: number
    ) {
        this.renderDistance = renderDistance
        this.chunkCount = distanceToChunk(renderDistance)
        this.chunksPerRow = Math.sqrt(this.chunkCount)
        this.voxelBuffer = new Int32Array()
        this.chunks = []
        this.chunkMap = {}
        this.nextXBoundary = {neg: 0, pos: 0}
        this.nextZBoundary = {neg: 0, pos: 0}
        this.rebuildQueue = []
    }

    init(originX: number, originZ: number) {
        const chunks = this.chunkCount
        if (chunks < 1) return false
        const voxelChunkUnits = CHUNK_X_DIM * CHUNK_Y_DIM * CHUNK_Z_DIM
        const chunkBytes = voxelChunkUnits * Int32Array.BYTES_PER_ELEMENT
        const bytes = chunkBytes * chunks
        this.voxelBuffer = new Int32Array(bytes)
        // generate initial voxels
        const chunkGrid = this.chunksPerRow
        const {renderDistance} = this
        const nearestXBoundary = originX - (originX % CHUNK_X_DIM)
        const minXActual = nearestXBoundary - (renderDistance * CHUNK_X_DIM)
        const minX = Math.max(minXActual, 0)
        const nearestZBoundary = originZ - (originZ % CHUNK_Z_DIM)
        const minZActual = nearestZBoundary - (renderDistance * CHUNK_Z_DIM)
        const minZ = Math.max(minZActual, 0)

        const {chunkMap} = this
        for (let x = 0; x < chunkGrid; x++) {
            for (let z = 0; z < chunkGrid; z++) {
                const id = (x * chunkGrid) + z
                const chunk = new TerrainChunk(
                    id.toString(), id * chunkBytes, this.voxelBuffer
                )
                const xOffset = minX + (x * CHUNK_X_DIM)
                const zOffset = minZ + (z * CHUNK_Z_DIM)
                chunk.generateVoxels(xOffset, zOffset)
                this.chunks.push(chunk)
                chunkMap[chunkKey(xOffset, zOffset)] = id
            }
        }

        // render initially constructed voxel data
        for (let i = 0; i < this.chunks.length; i++) {
            this.chunks[i].render()
        }
        const {nextXBoundary, nextZBoundary} = this
        nextXBoundary.neg = nearestXBoundary
        nextXBoundary.pos = nearestXBoundary + CHUNK_X_DIM
        nextZBoundary.neg = nearestZBoundary
        nextZBoundary.pos = nearestZBoundary + CHUNK_Z_DIM
        return true
    }

    isVoxelSolid(x: number, y: number, z: number) {
        if (x < 0 || z < 0 || y < 0 || y > CHUNK_Y_DIM) {
            return true
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
                this.rebuildQueue = createRebuildChunkItemsX(
                    this.rebuildQueue,
                    nextX,
                    nextZ,
                    this.renderDistance,
                    this.chunksPerRow,
                    false,
                    CHUNK_X_DIM,
                    CHUNK_Z_DIM
                )
                this.nextXBoundary = boundNeg(nextX, CHUNK_X_DIM)
                break
            case invalidation.positivex:
                console.log("rebuild neg x")
                this.rebuildQueue = createRebuildChunkItemsX(
                    this.rebuildQueue,
                    nextX,
                    nextZ,
                    this.renderDistance,
                    this.chunksPerRow,
                    true,
                    CHUNK_X_DIM,
                    CHUNK_Z_DIM
                )
                this.nextXBoundary = boundPos(nextX, CHUNK_X_DIM)
                break
            case invalidation.negativez:
                console.log("rebuild pos z")
                this.rebuildQueue = createRebuildChunkItemsX(
                    this.rebuildQueue,
                    nextZ,
                    nextX,
                    this.renderDistance,
                    this.chunksPerRow,
                    false,
                    CHUNK_Z_DIM,
                    CHUNK_X_DIM,
                    false
                )
                this.nextZBoundary = boundNeg(nextZ, CHUNK_Z_DIM)
                break
            case invalidation.positivez:
                console.log("rebuild neg z")
                this.rebuildQueue = createRebuildChunkItemsX(
                    this.rebuildQueue,
                    nextZ,
                    nextX,
                    this.renderDistance,
                    this.chunksPerRow,
                    true,
                    CHUNK_Z_DIM,
                    CHUNK_X_DIM,
                    false
                )
                this.nextZBoundary = boundPos(nextZ, CHUNK_Z_DIM)
                break
            default:
                console.log("no rebuilding neccessary")
                break
        }

        const {rebuildQueue: q, chunkMap} = this
        // rebuild a maximum of one chunk
        // per frame.
        if (q.length > 0) {
            const {oldKey, newKey} = q[q.length - 1]
            const chunkref = chunkMap[oldKey]
            const chunk = this.chunks[chunkref]
            const [xstr, zstr] = newKey.split(".")
            const x = parseInt(xstr, 10)
            const z = parseInt(zstr, 10)
            chunk.generateVoxels(x, z)
            chunkMap[oldKey] = chunk_encoding.null
            chunkMap[newKey] = chunkref
            chunk.render()
            console.log("rebuilt", newKey, "in place of", oldKey)
            q.pop()
        }
    }
}

/*
export class ChunkManager {
    chunks: Chunk[]
    originX: number
    originZ: number
    originColumn: number
    originRow: number
    originChunkIndex: number
    chunkDimensions: number
    
    constructor() {
        this.chunks = []
        this.originX = 0
        this.originZ = 0
        this.originChunkIndex = 0
        this.chunkDimensions = LOADED_CHUNKS
    }

    initGeneration() {
        const chunkDim = LOADED_CHUNKS
        const bufNum = chunkDim * chunkDim
        const voxBuf = new SharedArrayBuffer(
            CHUNK_BUFFER_SIZE * bufNum * Int32Array.BYTES_PER_ELEMENT
        )
        const chunks: Chunk[] = []
        const xbase = 0
        const zbase = 0
        let xOffset = xbase
        let zOffset = zbase
        for (let row = 0; row < chunkDim; row++) {
            for (let column = 0; column < chunkDim; column++) {
                const chunk = new Chunk({
                    x: xOffset, y: 0, z: zOffset, 
                    voxBuf, id: (row * chunkDim) + column,
                    xGrid: row * CHUNK_SIZE, 
                    zGrid: column * CHUNK_SIZE,
                }).init()
                chunks.push(chunk)
                zOffset += CHUNK_SIZE
            }
            zOffset = zbase
            xOffset += CHUNK_SIZE
        }
        this.chunks = chunks
        return this
    }

    initRender() {
        const chunkDim = this.chunkDimensions
        const c = this.chunks
        for (let x = 1; x < chunkDim - 1; x++) {
            for (let z = 1; z < chunkDim - 1; z++) {
                const id = (x * chunkDim) + z
                c[id].render()
            }
        }
        return this
    }

    isVoxelSolid(x: number, y: number, z: number) {
        const row = ~~(x / CHUNK_SIZE)
        const col = ~~(z / CHUNK_SIZE)
        const targetChunk = (row * this.chunkDimensions) + col
        const xReal = row * CHUNK_SIZE + x % CHUNK_SIZE
        const zReal = col * CHUNK_SIZE + z % CHUNK_SIZE
        return this.chunks[targetChunk].voxel(xReal, y, zReal)
    }
}
*/