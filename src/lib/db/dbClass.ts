import { JSONFile } from 'lowdb/node'
import type { Database, SerializedDatabase } from './types'
import { Low } from 'lowdb'
import { defaultData } from './defaultData'
import { serializeDatabase } from './serialization'
import { deserializeDb } from './db'

export class Db {
  public data: Database

  private lowConnector: Low<SerializedDatabase>

  private constructor(lowConnector: Low<SerializedDatabase>) {
    this.lowConnector = lowConnector

    this.data = deserializeDb(lowConnector.data)
  }

  public toJSON(): SerializedDatabase {
    return serializeDatabase(this.data)
  }

  public async write() {
    this.lowConnector.data = serializeDatabase(this.data)

    await this.lowConnector.write()
  }

  static async createFromFile(file: string) {
    const adapter = new JSONFile<SerializedDatabase>(file)

    const lowConnector = new Low<SerializedDatabase>(
      adapter,
      serializeDatabase(defaultData),
    )

    // Read data from JSON file, this will set db.data to the content of the file
    await lowConnector.read()

    // If file doesn't exist or is empty, write default data
    if (lowConnector.data === null) {
      lowConnector.data = serializeDatabase(defaultData)
      await lowConnector.write()
    }

    return new Db(lowConnector)
  }
}
