require("dotenv").config();
const {dbPool} = require("./db");
const jsMediaTags = require("jsmediatags");
const prompt = require('prompt-sync')();
const path = require("path");
const fs = require('fs');
const uuid = require("uuid");

function readTags(file) {
    return new Promise((resolve, reject) => {
        new jsMediaTags.Reader(file)
            .read({
                onSuccess: (tag) => {
                    resolve(tag);
                },
                onError: (error) => {
                    reject(error);
                }
            });
    })
}

(async function main() {
    console.log("MP3s With Data Tags in a folder");
    const from = path.normalize(prompt("Folder To get MP3s From> ")); // D:\Users\conor\Music\musiq

    console.log("Amuseing Songs Folder = amuseing folder/files/audio");
    const to = path.normalize(prompt("Amuseing Songs Folder> "));

    const directoryContents =  fs.readdirSync(from);



    for (let fileIdx = 0; fileIdx < directoryContents.length; fileIdx++) {
        const file = directoryContents[fileIdx];
        if (file.endsWith(".mp3")) {
            const tags = await readTags(path.join(from, file));
            const image = tags.tags.APIC;
            const output = Buffer.from(image.data.data);
            const imageName = uuid.v4() + "." + image.data.format.split("/")[1];
            fs.writeFileSync(path.join(to, "images", imageName), output);
            const audioName = uuid.v4() + ".mp3";
            fs.copyFileSync(path.join(from, file), path.join(to, "audio", audioName));
            const artists = tags.tags.artist.split("/");
            const songName = tags.tags.title;

            let artistIds = [];
            for (let i = 0; i < artists.length; i++) {
                const [rows] = await dbPool.query("SELECT * FROM audio_artists WHERE name LIKE ?", [artists[i]]);
                if (rows.length >= 1) {
                    artistIds.push(rows[0]._id);
                } else if (rows.length === 0) {
                    await dbPool.query("INSERT INTO audio_artists (name) VALUES (?)", [artists[i]]);
                    const [newRow] = await dbPool.query("SELECT * FROM audio_artists WHERE name LIKE ? ORDER BY _id DESC", [artists[i]]);
                    artistIds.push(newRow[0]._id);
                }
            }

            const [{insertId}] = await dbPool.query("INSERT INTO audio_songs (title, audioUrl, iconUrl, sourceId, sourceType) VALUES (?, ?, ?, ?, ?)" +
                "ON DUPLICATE KEY UPDATE audioUrl = ?, iconUrl = ?;", [
                songName, audioName, imageName, file, "amuseing-import-mp3", audioName, imageName
            ]);

            let artistSong = [];
            for (let v = 0; v < artistIds.length; v++) {
                artistSong.push([insertId, artistIds[v]])
            }

            await dbPool.query("INSERT IGNORE INTO audio_song_artists VALUES ?", [artistSong]);
        }
    }
})();