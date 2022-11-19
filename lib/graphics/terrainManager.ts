import {Quadtree, Vec2, Box2} from "./quadTree"
import {fractionalBMotion, biome, voxel} from "./chunkManager"
import {createNoise2D} from "simplex-noise"
import alea from "alea"
import {VertexData, Mesh, StandardMaterial, Color3} from "babylonjs"

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

const culledQuad = (
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

const visitedIndex = (x: number, y: number, z: number) => x * CHUNK_Z_DIMENSION * CHUNK_Y_DIMENSION + z * CHUNK_Y_DIMENSION + y

type AxisIterator = [number, number, number]
const greedyQuadIter = [0, 0, 0] as AxisIterator
const greedyQuadFace = [0, 0, 0] as AxisIterator

type VoxelBuffer = Int32Array
type AxisRef = 0 | 1 | 2
const greedyQuad = (
    mainAxis: AxisRef,
    mainAxisStart: number,
    mainAxisLimit: number,
    mainGlobalCoord: number,
    altAxis: AxisRef,
    altAxisStart: number,
    altAxisLimit: number,
    altGlobalCoord: number,
    tertiaryAxis: AxisRef,
    tertiaryAxisStart: number,
    teritaryAxisLimit: number,
    tertiaryGlobalCoord: number,
    vbuf: VoxelBuffer,
    vptr: number,
    visitedArr: Uint8Array,
    targetType: number,
    positiveAxis: boolean,
    axisFlag: number,
    lodFactor: number,
    vertices: number[]
) => {
    let mainAxisEnd = mainAxisStart + 1
    let altAxisEnd = altAxisStart + 1
    const faceCheckOffset = positiveAxis ? 1 : -1

    const iter = greedyQuadIter
    iter[altAxis] = altAxisStart
    iter[tertiaryAxis] = tertiaryAxisStart
    iter[mainAxis] = mainAxisEnd
    const face = greedyQuadFace
    face[altAxis] = altAxisStart
    face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
    face[mainAxis] = mainAxisEnd
    while (mainAxisEnd < mainAxisLimit) {
        iter[mainAxis] = mainAxisEnd
        const vIdx = visitedIndex(...iter)
        face[mainAxis] = mainAxisEnd
        const visited = visitedArr[vIdx] & axisFlag
        if (
            visited
            // next voxel is not same type
            || vbuf[voxaddr(...iter, vptr)] !== targetType 
            // next voxel does not have same exposed face
            || !(tertiaryAxisStart > teritaryAxisLimit - 2
                ? true
                : vbuf[voxaddr(...face, vptr)] === voxel.air)
        ) {
            break
        }
        visitedArr[vIdx] |= axisFlag
        mainAxisEnd++
    }

    let loop = true
    while (altAxisEnd < altAxisLimit) {
        const start = mainAxisStart
        const end = mainAxisEnd
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        face[altAxis] = altAxisEnd
        face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            const visited = visitedArr[vIdx] & axisFlag
            face[mainAxis] = main
            if (
                visited
                // next voxel is same type
                || vbuf[voxaddr(...iter, vptr)] !== targetType 
                // next voxel has the same exposed face
                || !(tertiaryAxisStart > teritaryAxisLimit - 2
                    ? true
                    : vbuf[voxaddr(...face, vptr)] === voxel.air)
            ) {
                loop = false
                break
            }
        }
        if (!loop) {
            break
        }
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            visitedArr[vIdx] |= axisFlag
        }
        altAxisEnd++
    }

    const vStart = vertices.length / 3                    
    const minAlt = altGlobalCoord
    const axisConstant = positiveAxis ? 1 : 0
    let minTertiary = tertiaryGlobalCoord
    const minMain = mainGlobalCoord
    const maxAlt = minAlt + (altAxisEnd - altAxisStart) * lodFactor
    let maxTertiary = 0
    let maxMain = minMain
    if (mainAxis === 1) {
        minTertiary += lodFactor * axisConstant
        maxMain += (mainAxisEnd - mainAxisStart)
    } else {
        minTertiary += axisConstant
        maxMain += (mainAxisEnd - mainAxisStart) * lodFactor
    }
    maxTertiary = minTertiary
    iter[altAxis] = minAlt
    iter[tertiaryAxis] = minTertiary
    iter[mainAxis] = minMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    vertices.push(...iter)
    
    iter[altAxis] = minAlt
    iter[mainAxis] = maxMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    // min & max tertiary are the same here
    iter[tertiaryAxis] = maxTertiary
    vertices.push(...iter)
    return vStart
    /*
    const mainAxis = 2
    const mainAxisStart = z
    let mainAxisEnd = mainAxisStart + 1
    const mainAxisLimit = CHUNK_Z_DIMENSION
    const altAxis = 0
    const altAxisStart = x
    let altAxisEnd = altAxisStart + 1
    const altAxisLimit = CHUNK_X_DIMENSION
    const tertiaryAxis = 1
    const tertiaryAxisStart = y
    const teritaryAxisLimit = CHUNK_Y_DIMENSION
    const vbuf = voxelBuffer
    const vptr = ptr
    const visitedArr = visitedArray
    const targetType = type
    const positiveAxis = true
    const faceCheckOffset = positiveAxis ? 1 : -1
    const axisConstant = positiveAxis ? 1 : 0
    const axisFlag = positiveYbit
    const altRealCoord = xGlobal
    const tertiaryRealCoord = y + axisConstant
    const mainRealCoord = zGlobal
    const lodFactor = skFactor
    //const min = {
    //    x: altRealCoord, 
    //    y: tertiaryRealCoord,
    //    z: mainRealCoord
    //}
    const iter = [0, 0, 0] as [number, number, number]
    iter[altAxis] = altAxisStart
    iter[tertiaryAxis] = tertiaryAxisStart
    iter[mainAxis] = mainAxisEnd
    const face = [...iter] as typeof iter
    face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
    //const iter = [altAxisStart, tertiaryAxisStart, mainAxisEnd] as [number, number, number]
    //const face = [altAxisStart, tertiaryAxisStart + faceCheckOffset, mainAxisEnd] as [number, number, number]
    while (mainAxisEnd < mainAxisLimit) {
        iter[mainAxis] = mainAxisEnd
        const vIdx = visitedIndex(...iter)
        face[mainAxis] = mainAxisEnd
        const visited = visitedArr[vIdx] & axisFlag
        if (
            visited
            // next voxel is not same type
            || vbuf[voxaddr(...iter, vptr)] !== targetType 
            // next voxel does not have same exposed face
            || !(tertiaryAxisStart > teritaryAxisLimit - 2
                ? true
                : vbuf[voxaddr(...face, vptr)] === voxel.air)
        ) {
            break
        }
        visitedArr[vIdx] |= axisFlag
        mainAxisEnd++
    }

    let loop = true
    while (altAxisEnd < altAxisLimit) {
        const start = mainAxisStart
        const end = mainAxisEnd
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        face[altAxis] = altAxisEnd
        face[tertiaryAxis] = tertiaryAxisStart + faceCheckOffset
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            const visited = visitedArr[vIdx] & axisFlag
            face[mainAxis] = main
            if (
                visited
                // next voxel is same type
                || vbuf[voxaddr(...iter, vptr)] !== targetType 
                // next voxel has the same exposed face
                || !(tertiaryAxisStart > teritaryAxisLimit - 2
                    ? true
                    : vbuf[voxaddr(...face, vptr)] === voxel.air)
            ) {
                loop = false
                break
            }
        }
        if (!loop) {
            break
        }
        iter[altAxis] = altAxisEnd
        iter[tertiaryAxis] = tertiaryAxisStart
        for (let main = start; main < end; main++) {
            iter[mainAxis] = main
            const vIdx = visitedIndex(...iter)
            visitedArr[vIdx] |= axisFlag
        }
        altAxisEnd++
    }
    
    //const max = {
    //    x: altRealCoord + (altAxisEnd - altAxisStart) * lodFactor,
    //    y: tertiaryRealCoord,
    //    z: mainRealCoord + (mainAxisEnd - mainAxisStart) * lodFactor
    //}

    const vStart = vertices.length / 3
    
    const minAlt = altRealCoord
    const minTertiary = tertiaryRealCoord
    const minMain = mainRealCoord
    const maxAlt = altRealCoord + (altAxisEnd - altAxisStart) * lodFactor
    const maxTertiary = minTertiary
    const maxMain = mainRealCoord + (mainAxisEnd - mainAxisStart) * lodFactor
    iter[altAxis] = minAlt
    iter[tertiaryAxis] = minTertiary
    iter[mainAxis] = minMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    vertices.push(...iter)
    
    iter[altAxis] = minAlt
    iter[mainAxis] = maxMain
    vertices.push(...iter)
    
    iter[altAxis] = maxAlt
    // min & max tertiary are the same here
    iter[tertiaryAxis] = maxTertiary
    vertices.push(...iter)
    
    // min & max y are the same here
    //vertices.push(
    //    min.x, min.y, min.z,
    //    max.x, min.y, min.z,
    //    min.x, min.y, max.z,
    //    max.x, max.y, max.z,
    //)
    */
}

const createColor = (
    levelOfDetail: number, 
    vertexCount: number,
    colors: number[]
) => {
    switch (levelOfDetail) {
        case 1:
            vertexColors(0.0, 1.0, 0.0, vertexCount, colors)
            break
        case 2:
            vertexColors(1.0, 0.0, 1.0, vertexCount, colors)
            break
        case 3:
            vertexColors(1.0, 0.0, 0.0, vertexCount, colors)
            break
        default: {
            const det = (levelOfDetail * 0.1)
            const bas = 0.2
            const n = det + bas
            vertexColors(n, n, n, vertexCount, colors)
        }
    }
}

class Chunk {
    center: Vec2
    bounds: Box2
    dimensions: Vec2
    levelOfDetail: number
    key: string
    voxelBuffer: VoxelBuffer
    vertexData: VertexData
    mesh: Mesh
    isRendered: boolean
    simulationDelta: number 
    meshingDelta: number
    mostRecentSimulationRendered: boolean
    colors: number[]
    vertices: number[]
    faces: number[]
    meshMethod: string
    
    constructor({
        center = new Vec2(),
        bounds = new Box2(new Vec2(), new Vec2()),
        dimensions = new Vec2(),
        levelOfDetail = 1,
        key = "0.0[16]",
        id = "terrain-chunk-1",
    } = {}) {
        this.vertices = []
        this.faces = []
        this.colors = []
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
        this.mostRecentSimulationRendered = false
        this.simulationDelta = 0.0
        this.meshingDelta = 0.0
        this.meshMethod = "none"
    }

    simulate() {
        const start = Date.now()
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
                const biomeType = biome(height - 1, moisture)
                for (let y = 0; y < height; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = biomeType
                }
                // zero out the rest
                // think of a more efficent way later?
                for (let y = height; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = voxel.air
                }
            }
        }
        this.simulationDelta = Date.now() - start
        this.mostRecentSimulationRendered = false
    }

    culledMesh() {
        const start = Date.now()
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
                    
                    culledQuad(
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
        this.vertices = vertices
        this.faces = indices
        this.colors = colors
        this.meshMethod = "culled"
        this.createSkirt()
        this.meshingDelta = Date.now() - start
    }

    greedyMesh() {
        const start = Date.now()
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        const skFactor = skipFactor(levelOfDetail)
        const sliceVolume = (
            CHUNK_Y_DIMENSION 
            * CHUNK_X_DIMENSION
            * CHUNK_Z_DIMENSION
        )
        const visitedArray = new Uint8Array(sliceVolume)
        const positiveZbit = 1
        const negativeZbit = 2
        const positiveXbit = 4
        const negativeXbit = 8
        const positiveYbit = 16
        const negativeYbit = 32
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                
                for (let y = 0; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, zaddress)
                    const visitedRef = visitedIndex(x, y, z)
                    const visited = visitedArray[visitedRef]
                    const positiveYAxisVisited = visited & positiveYbit
                    const negativeYAxisVisited = visited & negativeYbit
                    const positiveXAxisVisited = visited & positiveXbit
                    const negativeXAxisVisited = visited & negativeXbit
                    const positiveZAxisVisited = visited & positiveZbit
                    const negativeZAxisVisited = visited & negativeZbit
                    if (
                        positiveYAxisVisited
                        && negativeYAxisVisited
                        && positiveXAxisVisited
                        && negativeXAxisVisited
                        && positiveZAxisVisited
                        && negativeZAxisVisited
                    ) {
                        continue
                    }
                    const type = voxelBuffer[v]
                    if (type === voxel.air) {
                        visitedArray[visitedRef] |= positiveYbit
                        visitedArray[visitedRef] |= negativeYbit
                        visitedArray[visitedRef] |= positiveXbit
                        visitedArray[visitedRef] |= negativeXbit
                        visitedArray[visitedRef] |= positiveXbit
                        visitedArray[visitedRef] |= negativeZbit
                        continue
                    }

                    const renderPositiveY = y > CHUNK_Y_DIMENSION - 2
                        ? true
                        : voxelBuffer[v + 1] === voxel.air
                    if (renderPositiveY && !positiveYAxisVisited) {
                        const vStart = greedyQuad(
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            true,
                            positiveYbit,
                            skFactor,
                            vertices
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }
                    const renderNegativeY = (
                        y > 0 
                        && voxelBuffer[v - 1] === voxel.air
                    )
                    if (renderNegativeY && !negativeYAxisVisited) {
                        const vStart = greedyQuad(
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            false,
                            negativeYbit,
                            skFactor,
                            vertices
                        )
                        // not sure if this has the correct normals
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    const renderPositiveX = x > CHUNK_X_DIMENSION - 2 
                        ? false
                        : voxelBuffer[voxaddr(x + 1, y, z, ptr)] === voxel.air
                    if (renderPositiveX && !positiveXAxisVisited) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            true,
                            positiveXbit,
                            skFactor,
                            vertices
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    const renderNegativeX = x < 1 
                        ? false
                        : voxelBuffer[voxaddr(x - 1, y, z, ptr)] === voxel.air
                    if (renderNegativeX && !negativeXAxisVisited) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            false,
                            negativeXbit,
                            skFactor,
                            vertices
                        )
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    const renderPositiveZ = z > CHUNK_Z_DIMENSION - 2 
                        ? false
                        : voxelBuffer[voxaddr(x, y, z + 1, ptr)] === voxel.air
                    if (renderPositiveZ && !positiveZAxisVisited) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            true,
                            positiveZbit,
                            skFactor,
                            vertices
                        )
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }

                    const renderNegativeZ = z < 1 
                        ? false
                        : voxelBuffer[voxaddr(x, y, z - 1, ptr)] === voxel.air
                    if (renderNegativeZ && !negativeZAxisVisited) {
                        const vStart = greedyQuad(
                            1,
                            y,
                            CHUNK_Y_DIMENSION,
                            y,
                            0,
                            x,
                            CHUNK_X_DIMENSION,
                            xGlobal,
                            2,
                            z,
                            CHUNK_Z_DIMENSION,
                            zGlobal,
                            voxelBuffer,
                            ptr,
                            visitedArray,
                            type,
                            false,
                            positiveZbit,
                            skFactor,
                            vertices
                        )
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                        createColor(levelOfDetail, 4, colors)
                    }
                }
            }
        }
        this.meshMethod = "greedy"
        this.colors = colors
        this.vertices = vertices
        this.faces = indices
        this.createSkirt()
        this.meshingDelta = Date.now() - start
    }

    createSkirt() {
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices = this.faces
        const vertices = this.vertices
        const colors = this.colors
        const skFactor = skipFactor(levelOfDetail)
        const chunkZLimits = [0, CHUNK_Z_DIMENSION - 1]
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (const z of chunkZLimits) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                let y = 0

                while (y < CHUNK_Y_DIMENSION) {
                    const v = yaddr(y, zaddress)
                    const targetType = voxelBuffer[v]
                    if (targetType === voxel.air) {
                        y++
                        continue
                    }

                    let minY = y
                    let maxY = minY
                    while (true) {
                        const v = yaddr(y, zaddress)
                        const candidateType = voxelBuffer[v]
                        if (
                            targetType !== candidateType
                            || y > CHUNK_Y_DIMENSION - 2
                        ) {
                            maxY = y + 1
                            break
                        }
                        y++
                    }
                    const positiveAxis = z > 0
                    const maxX = xGlobal + skFactor
                    const vStart = vertices.length / 3
                    const targetZ = positiveAxis 
                        ? zGlobal + skFactor
                        : zGlobal
                    const actualMinY = minY - 1
                    const actualMaxY = maxY - 1
                    vertices.push(
                        xGlobal, actualMinY, targetZ,
                        maxX, actualMinY, targetZ,
                        xGlobal, actualMaxY, targetZ,
                        maxX, actualMaxY, targetZ,
                    )
                    if (positiveAxis) {
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                    } else {
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                    }
                    createColor(levelOfDetail, 4, colors)
                }
            }
        }

        const chunkXLimits = [0, CHUNK_X_DIMENSION - 1]
        for (const x of chunkXLimits) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                let y = 0

                while (y < CHUNK_Y_DIMENSION) {
                    const v = yaddr(y, zaddress)
                    const targetType = voxelBuffer[v]
                    if (targetType === voxel.air) {
                        y++
                        continue
                    }

                    let minY = y
                    let maxY = minY
                    while (true) {
                        const v = yaddr(y, zaddress)
                        const candidateType = voxelBuffer[v]
                        if (
                            targetType !== candidateType
                            || y > CHUNK_Y_DIMENSION - 2
                        ) {
                            maxY = y + 1
                            break
                        }
                        y++
                    }
                    const positiveAxis = x > 0
                    const maxZ = zGlobal + skFactor
                    const vStart = vertices.length / 3
                    const targetX = positiveAxis 
                        ? xGlobal + skFactor 
                        : xGlobal
                    const actualMinY = minY - 1
                    const actualMaxY = maxY - 1
                    vertices.push(
                        targetX, actualMinY, zGlobal,
                        targetX, actualMinY, maxZ,
                        targetX, actualMaxY, zGlobal,
                        targetX, actualMaxY, maxZ,
                    )
                    if (positiveAxis) {
                        indices.push(
                            vStart + 0, vStart + 1, vStart + 2,
                            vStart + 3, vStart + 2, vStart + 1, 
                        )
                    } else {
                        indices.push(
                            vStart + 0, vStart + 2, vStart + 1,
                            vStart + 3, vStart + 1, vStart + 2, 
                        )
                    }
                    createColor(levelOfDetail, 4, colors)
                }
            }
        }
    }

    render({
        wireframe = false,
        logStats = false
    } = {}) {
        const {faces, vertices, colors, vertexData: vd, mesh} = this
        vd.indices = faces
        vd.positions = vertices
        if (wireframe) {
            const mat = new StandardMaterial("wireframe" + Date.now())
            mat.emissiveColor = Color3.White()
            mat.wireframe = true
            mesh.material = mat
        } else {
            vd.colors = colors
        }
        vd.applyToMesh(mesh, true)
        this.isRendered = true
        this.mostRecentSimulationRendered = true
        if (logStats) {
            console.info(`${this.meshMethod} mesh took`, this.meshingDelta, "ms, sim took", this.simulationDelta, "ms. vs:", this.vertexCount().toLocaleString("en-us"))
        }
    }

    destroyMesh() {
        const name = this.mesh.name
        this.mesh.dispose()
        this.mesh = new Mesh(name)
    }

    vertexCount() {
        return this.vertices.length / 3
    }

    faceCount() {
        return this.faces.length / 3
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
        chunk.greedyMesh()
        chunk.render({wireframe: false, logStats: false})
        return true
    }

    isVoxelSolid(x: number, y: number, z: number) {
        return false
    }

    vertexCount() {
        const cs = this.chunks
        return cs.reduce((acc, c) => acc + c.vertexCount(), 0)
    }

    faceCount() {
        const cs = this.chunks
        return cs.reduce((acc, c) => acc + c.faceCount(), 0)
    }

    chunkCount() {
        return this.chunks.length
    }
}