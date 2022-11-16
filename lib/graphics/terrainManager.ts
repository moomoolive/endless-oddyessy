import {Quadtree, Vec2, Box2} from "./quadTree"
import {fractionalBMotion, biome, voxel} from "./chunkManager"
import {createNoise2D} from "simplex-noise"
import alea from "alea"
import {VertexData, Mesh} from "babylonjs"

const noise1 = createNoise2D(alea("seed1"))

const CHUNK_X_DIMENSION = 64
const CHUNK_Z_DIMENSION = CHUNK_X_DIMENSION
const CHUNK_Y_DIMENSION = 128
const VOXELS_PER_CHUNK = (
    CHUNK_X_DIMENSION
    * CHUNK_Y_DIMENSION
    * CHUNK_Z_DIMENSION
)
const TERRAIN_MID = 50
const BYTES_PER_CHUNK = VOXELS_PER_CHUNK * Int32Array.BYTES_PER_ELEMENT

type n = number
const xaddr = (ptr: n, x: n) => ptr + (x * CHUNK_Z_DIMENSION * CHUNK_Y_DIMENSION)
const zaddr = (z: n, xAddress: n) => (z * CHUNK_Y_DIMENSION) + xAddress
const yaddr = (y: n, zAddress: n) => y + zAddress
const voxaddr = (x: n, y: n, z: n, ptr: n) => yaddr(y, zaddr(z, xaddr(ptr, x)))
const elevationNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 200.0, 6.0, 0.4, 2.0)
const moistureNoise = (x: n, z: n) => fractionalBMotion(noise1, x, z, 512.0, 4.0, 0.5, 4.0)
const generateHeight = (x: n, z: n) => Math.abs(~~(elevationNoise(x, z) * CHUNK_Y_DIMENSION) + TERRAIN_MID)

const vertexColors = (
    r: number, 
    g: number, 
    b: number, 
    vertexCount: number,
    colors: number[]
) => {
    for (let i = 0; i < vertexCount; i++) {
        colors.push(r, g, b, 0.0)
    }
    return colors
}

const NO_VERTEX = -1
const ensureVertexExist = (
    vertexMap: number[],
    requiredVertex1: number, 
    requiredVertex2: number, 
    requiredVertex3: number, 
    requiredVertex4: number, 
    vertices: number[],
    potentialVertices: number[],
) => {
    const required = [
        requiredVertex1, 
        requiredVertex2, 
        requiredVertex3,
        requiredVertex4
    ]
    for (const requiredVertex of required) {
        if (vertexMap[requiredVertex] === NO_VERTEX) {
            const base = requiredVertex * 3
            const indicesRef = vertices.length / 3
            vertices.push(
                potentialVertices[base],
                potentialVertices[base + 1],
                potentialVertices[base + 2],
            )
            vertexMap[requiredVertex] = indicesRef
        }
    }
}

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
    voxelType: number,
    levelOfDetail: number,
    skFactor: number
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

    /*
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
    */

    /*
    vertexMap reference (pretty fancy eh?)
       v5+--------+v7  +y  +z
        /|       /|     | /
       / |      / |     + -- +x
    v4+--------+v6|    (reference angle)
      |  |     |  |
      |v1+-----|--+v3
      | /      | /
      |/       |/
    v0+--------+v2 
    */
    
    const vertexMap = [
        NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX, // bottom vertices
        NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX  // top vertices
    ]
    const f = skFactor
    const potentialVertices = [
        // bottom vertices
        // [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
        xGlobal + 0, yGlobal + 0, zGlobal + 0,
        xGlobal + 0, yGlobal + 0, zGlobal + f,
        xGlobal + f, yGlobal + 0, zGlobal + 0,
        xGlobal + f, yGlobal + 0, zGlobal + f,
        // top vertices
        // [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
        xGlobal + 0, yGlobal + 1, zGlobal + 0,
        xGlobal + 0, yGlobal + 1, zGlobal + f,
        xGlobal + f, yGlobal + 1, zGlobal + 0,
        xGlobal + f, yGlobal + 1, zGlobal + f
    ]
    const start = vertices.length / 3

    if (renderNegativeX) {
        ensureVertexExist(
            vertexMap,
            0, 5, 1, 4,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[5], vertexMap[1],
            vertexMap[4], vertexMap[5], vertexMap[0],
        )
        //indices.push(
        //    b + 0, b + 5, b + 1,
        //    b + 4, b + 5, b + 0,
        //)
    }
    if (renderPositiveX) {
        ensureVertexExist(
            vertexMap,
            2, 3, 7, 6,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[2], vertexMap[3], vertexMap[7],
            vertexMap[2], vertexMap[7], vertexMap[6],
        )
        //indices.push(
        //    b + 2, b + 3, b + 7,
        //    b + 2, b + 7, b + 6,
        //)
    }

    if (renderNegativeY) {
        ensureVertexExist(
            vertexMap,
            0, 1, 2, 3,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[1], vertexMap[2],
            vertexMap[3], vertexMap[2], vertexMap[1],
        )
        //indices.push(
        //    b + 0, b + 1, b + 2,
        //    b + 3, b + 2, b + 1,
        //)
    }

    if (renderPositiveY) {
        ensureVertexExist(
            vertexMap,
            4, 6, 5, 7,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[4], vertexMap[6], vertexMap[5],
            vertexMap[7], vertexMap[5], vertexMap[6],
        )
        //indices.push(
        //    b + 4, b + 6, b + 5,
        //    b + 7, b + 5, b + 6,
        //)
    }

    if (renderNegativeZ) {
        ensureVertexExist(
            vertexMap,
            0, 2, 4, 6,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[0], vertexMap[2], vertexMap[4],
            vertexMap[4], vertexMap[2], vertexMap[6]
        )
        //indices.push(
        //    b + 0, b + 2, b + 4,
        //    b + 4, b + 2, b + 6,
        //)
    }
    
    if (renderPositiveZ) {
        ensureVertexExist(
            vertexMap,
            1, 5, 3, 7,
            vertices,
            potentialVertices
        )
        indices.push(
            vertexMap[1], vertexMap[5], vertexMap[3],
            vertexMap[5], vertexMap[7], vertexMap[3],
        )
        //indices.push(
        //    b + 1, b + 5, b + 3,
        //    b + 5, b + 7, b + 3,
        //)
    }
    const vCount = vertices.length / 3 - start

    switch (levelOfDetail) {
        case 1:
            vertexColors(0.0, 1.0, 0.0, vCount, colors)
            break
        case 2:
            vertexColors(0.0, 0.0, 1.0, vCount, colors)
            break
        case 3:
            vertexColors(1.0, 0.0, 0.0, vCount, colors)
            break
        default: {
            const det = (levelOfDetail * 0.1)
            const bas = 0.2
            const n = det + bas
            vertexColors(n, n, n, vCount, colors)
        }
    }
}

const logarithm = (base: number, x: number) => Math.log(x) / Math.log(base)
const baseLod = logarithm(2, CHUNK_X_DIMENSION)

const lod = (size: number) => (logarithm(2, size) - baseLod) + 1
const skipFactor = (levelOfDetail: number) => (2 ** (baseLod + levelOfDetail - 1)) / CHUNK_X_DIMENSION

class Chunk {
    center: Vec2
    bounds: Box2
    dimensions: Vec2
    levelOfDetail: number
    key: string
    voxelBuffer: Int32Array
    vertexData: VertexData
    mesh: Mesh
    isRendered: boolean
    
    constructor({
        center = new Vec2(),
        bounds = new Box2(new Vec2(), new Vec2()),
        dimensions = new Vec2(),
        levelOfDetail = 1,
        key = "0.0[16]",
        id = "terrain-chunk-1",
    } = {}) {
        this.key = key
        this.center = center
        this.bounds = bounds
        this.dimensions = dimensions
        this.levelOfDetail = Math.max(levelOfDetail, 1)
        const bytes = new SharedArrayBuffer(BYTES_PER_CHUNK)
        this.voxelBuffer = new Int32Array(bytes)
        this.vertexData = new VertexData()
        this.mesh = new Mesh(id)
        this.isRendered = false
    }

    simulate() {
        this.levelOfDetail = Math.max(this.levelOfDetail, 1)
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originx + x * skFactor
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originz + z * skFactor
                const calcHeight = generateHeight(xGlobal, zGlobal)
                const height = Math.max(calcHeight, 1)
                const moisture = moistureNoise(xGlobal, zGlobal)
                for (let y = 0; y < height; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = biome(height, moisture)
                }
                // zero out the rest
                // think of a more efficent way later?
                for (let y = height; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = voxel.air
                }
            }
        }
    }

    render() {
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                
                for (let y = 0; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, zaddress)
                    const type = voxelBuffer[v]
                    if (type === voxel.air) {
                        continue
                    }

                    const renderNegativeY = (
                        y > 0 
                        && voxelBuffer[v - 1] === voxel.air
                    )
                    const renderPositiveY = y > CHUNK_Y_DIMENSION - 2
                        ? true
                        : voxelBuffer[v + 1] === voxel.air

                    const renderNegativeX = x < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal - 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x - 1, y, z, ptr)] === voxel.air
                    const renderPositiveX = x > CHUNK_X_DIMENSION - 2 
                        ? false //!this.globalRef.isVoxelSolid(xGlobal + 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x + 1, y, z, ptr)] === voxel.air

                    const renderNegativeZ = z < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal - 1)
                        : voxelBuffer[voxaddr(x, y, z - 1, ptr)] === voxel.air
                    const renderPositiveZ = z > CHUNK_Z_DIMENSION - 2 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal + 1)
                        : voxelBuffer[voxaddr(x, y, z + 1, ptr)] === voxel.air
                    
                    createTerrainGeometry(
                        indices, vertices, colors,
                        renderNegativeY, renderPositiveY,
                        renderNegativeX, renderPositiveX,
                        renderNegativeZ, renderPositiveZ,
                        xGlobal, zGlobal, y, type,
                        levelOfDetail, skFactor
                    )
                }
            }
        }
        const {vertexData: vd, mesh} = this
        vd.indices = indices
        vd.positions = vertices
        vd.colors = colors
        vd.applyToMesh(mesh, true)
        this.isRendered = true
    }

    destroyMesh() {
        const name = this.mesh.name
        this.mesh.dispose()
        this.mesh = new Mesh(name)
    }
}

const chunkkey = (x: number, z: number, size: number) => `${x}.${z}[${size}]`

const NULL_CHUNK_HANDLE = -1

const moduloIntFast = (dividend: number, divisor: number) => {
    return dividend - ~~(dividend / divisor) * divisor
}

export class TerrainManager {
    minNodeSize: number
    chunkIndex: Map<string, number>
    recycledChunks: number[]
    rebuildChunks: number[]
    chunks: Chunk[]
    nearestChunkBoundaryX: number
    nearestChunkBoundaryZ: number

    constructor({} = {}) {
        this.minNodeSize = CHUNK_X_DIMENSION
        this.chunkIndex = new Map()
        this.nearestChunkBoundaryX = 0
        this.nearestChunkBoundaryZ = 0
        this.recycledChunks = []
        this.chunks = []
        this.rebuildChunks = []
    }

    private getRecyclableChunk() {
        if (this.recycledChunks.length < 1) {
            return NULL_CHUNK_HANDLE
        }
        return this.recycledChunks.pop()!
    }

    diffChunks(cameraX: number, cameraY: number) {
        const pt = 2_048
        const quadTree = new Quadtree({
            min: new Vec2(-pt, -pt),
            max: new Vec2(pt, pt),
            minNodeSize: CHUNK_X_DIMENSION
        })
        const camera = new Vec2(cameraX, cameraY)
        quadTree.insert(camera)
        const children = quadTree.getChildren()
        console.log("children", children.length)

        const newIndex = new Map()
        for (const {center, size} of children) {
            const key = chunkkey(center.x, center.z, size.x)
            newIndex.set(key, NULL_CHUNK_HANDLE)
        }

        const oldIndex = this.chunkIndex
        let chunksRecycled = 0
        for (const [oldKey, ref] of oldIndex.entries()) {
            if (!newIndex.has(oldKey)) {
                this.recycledChunks.push(ref)
                chunksRecycled++
            } else {
                newIndex.set(oldKey, ref)
            }
        }

        const minQuad = quadTree.minNodeSize
        let chunkref = 0
        let chunksReused = 0
        for (const {center, bounds, size} of children) {
            const key = chunkkey(center.x, center.z, size.x)
            if (oldIndex.has(key)) {
                continue
            }
            chunkref = this.getRecyclableChunk()
            if (chunkref !== NULL_CHUNK_HANDLE) {
                const chunk = this.chunks[chunkref]
                chunk.key = key
                chunk.bounds = bounds
                chunk.center = center
                chunk.dimensions = size
                chunk.levelOfDetail = lod(size.x)
                chunksReused++
            } else {
                chunkref = this.chunks.length
                const chunk = new Chunk({
                    center, bounds, dimensions: size,
                    levelOfDetail: lod(size.x),
                    key, 
                    id: "terrain-chunk-" + chunkref.toString()
                })
                this.chunks.push(chunk)
            }
            newIndex.set(key, chunkref)
            this.rebuildChunks.push(chunkref)
        }

        for (const chunkref of this.recycledChunks) {
            const chunk = this.chunks[chunkref]
            if (chunk.isRendered) {
                chunk.destroyMesh()
            }
        } 
        this.chunkIndex = newIndex
    }

    hasTasks() {
        return this.rebuildChunks.length > 0
    }

    execPendingTask() {
        if (this.rebuildChunks.length < 1) {
            return false
        }
        const chunkref = this.rebuildChunks.pop()!
        const chunk = this.chunks[chunkref]
        chunk.simulate()
        chunk.render()
        return true
    }

    isVoxelSolid(x: number, y: number, z: number) {
        return false
    }
}