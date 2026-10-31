# MinMSN

Ett Windows-program som ser ut och känns som gamla MSN Messenger, men som visar och skickar meddelanden via Facebook Messenger.

Bygger på Electron. Programmet kör messenger.com osynligt i bakgrunden och visar ett eget gränssnitt ovanpå.

## Testa programmet (utan att installera något)

1. Gå till fliken **Actions** på GitHub och öppna den senaste lyckade körningen av "Bygg Windows-program".
2. Ladda ner **MinMSN-windows** längst ner, packa upp zip-filen och dubbelklicka på `MinMSN-x.y.z.exe`.
3. Windows kan varna för en okänd utgivare. Välj "Mer info" och sedan "Kör ändå".
4. Logga in i Facebook-fönstret som dyker upp. När du är inloggad göms det och konversationerna visas i MinMSN.

## Demoläge

`npm run demo` visar påhittade kontakter så att man kan titta på utseendet utan att logga in.

## Köra från källkoden (för utvecklare)

```
npm install
npm start
```
