import { db } from "../lib/db.js";

import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import csvParser from "csv-parser";
import { v4 as uuidv4 } from "uuid";
import { parse, format } from "date-fns";
import { es } from "date-fns/locale";

const BASE_PATH = "src/uploads/inventories/";

const downloadImage = async (url, dest) => {
  const response = await axios({
    url,
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(dest);
    response.data.pipe(fileStream);

    fileStream.on("finish", () => resolve(dest));
    fileStream.on("error", reject);
  });
};

const processImage = async (imagePath, fileName) => {
  const thumbnailDir = `${BASE_PATH}images/thumbnails/`;
  const thumbnailPath = `${thumbnailDir}${fileName}-thumbnail.jpg`;
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
  await sharp(imagePath).resize(150, 150).toFile(thumbnailPath);
  let urlRelativePath = BASE_PATH.replace("src/", "");
  return {
    url: `${urlRelativePath}images/${fileName}.jpg`,
    thumbnail: thumbnailPath.split("src/")[1],
  };
};

const convertDateFormat = (dateStr) => {
  try {
    if (!dateStr || dateStr.trim() === "") {
      return null;
    }

    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(dateStr.trim())) {
      console.error(`Formato de fecha inválido: ${dateStr}`);
      return null;
    }

    const parsedDate = parse(dateStr, "dd/MM/yyyy", new Date(), { locale: es });

    if (isNaN(parsedDate)) {
      console.error(`Fecha inválida tras el parseo: ${dateStr}`);
      return null;
    }

    return format(parsedDate, "MM/dd/yyyy");
  } catch (error) {
    console.error("Error al convertir la fecha:", error);
    return null;
  }
};

const parseImages = (rawImages) => {
  try {
    if (rawImages.startsWith("'") && rawImages.endsWith("'")) {
      rawImages = rawImages.slice(1, -1);
    }

    rawImages = rawImages.replace(/'/g, '"');

    const parsedImages = JSON.parse(rawImages);

    return Array.isArray(parsedImages) ? parsedImages : [];
  } catch (error) {
    console.error("Error parsing images:", error);
    console.error("Problematic JSON string:", rawImages);
    return [];
  }
};

const validateNotEmpty = (value, fieldName, errors, index) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value === "number" && isNaN(value))
  ) {
    errors.push(`Fila ${index + 1}: El campo '${fieldName}' es obligatorio`);
  }
};

const validateFields = (inventory, userId, index, errors) => {
  validateNotEmpty(inventory.model, "Nombre del Modelo", errors, index);
  validateNotEmpty(inventory.year, "Año del Modelo", errors, index);
  validateNotEmpty(inventory.brand, "Marca del Inventario", errors, index);
  validateNotEmpty(inventory.type, "Tipo de Inventario", errors, index);
  validateNotEmpty(inventory.serialNumber, "Número de Serie", errors, index);
  validateNotEmpty(
    inventory.receptionDate,
    "Fecha de Recepción",
    errors,
    index
  );
  validateNotEmpty(inventory.status, "Estado", errors, index);

  if (
    inventory.status &&
    !["ALTA", "BAJA", "PROPUESTA"].includes(inventory.status)
  ) {
    errors.push(
      `Fila ${
        index + 1
      }: El campo 'Estado' debe ser uno de 'ALTA', 'BAJA' o 'PROPUESTA'`
    );
  }

  if (inventory.receptionDate && isNaN(Date.parse(inventory.receptionDate))) {
    errors.push(
      `Fila ${
        index + 1
      }: El campo 'Fecha de Recepción' debe ser una fecha válida`
    );
  }

  if (!userId) {
    errors.push(
      `Fila ${
        index + 1
      }: El usuario no es válido, por favor inicie sesión nuevamente`
    );
  }
};

export const createMultipleInventories = async (req, res) => {
  const csvFile = req.file;
  const user = req.user;

  if (!csvFile) {
    return res.status(400).json({ message: "No se subió ningún archivo." });
  }

  const inventories = [];
  const errors = [];
  const successfulInventories = [];

  try {
    fs.createReadStream(csvFile.path)
      .pipe(csvParser())
      .on("data", (row) => {
        const parsedImages = parseImages(row["Imágenes"] || "[]");
        inventories.push({
          model: row["Nombre del Modelo"],
          year: parseInt(row["Año del Modelo"], 10),
          brand: row["Marca del Inventario"],
          type: row["Tipo de Inventario"],
          serialNumber: row["Número de Serie"],
          receptionDate: convertDateFormat(row["Fecha de Recepción"]),
          status: row["Estado"],
          comments: row["Comentarios"],
          images: parsedImages.join(","),
        });
      })
      .on("end", async () => {
        const userId = user?.id;
        for (const [index, inventory] of inventories.entries()) {
          validateFields(inventory, userId, index, errors);

          const model = await db.model.findFirst({
            where: {
              name: inventory.model,
              year: inventory.year || undefined,
              brand: {
                name: inventory.brand,
              },
              type: {
                name: inventory.type,
              },
              enabled: true,
            },
          });
          if (!model) {
            errors.push(
              `Fila ${index + 1}: El modelo '${inventory.model}' (${
                inventory.year
              }) - ${inventory.brand} ${inventory.type} no existe`
            );
            continue;
          }

          const userExists = await db.user.findFirst({
            where: { id: user.id },
          });
          if (!userExists) {
            errors.push(
              `Fila ${
                index + 1
              }: El usuario no es válido, por favor inicie sesión nuevamente`
            );
            continue;
          }

          let imagePaths = [];
          if (inventory.images) {
            const imageUrls = inventory.images.split(",");
            for (const imageUrl of imageUrls) {
              try {
                const imageId = uuidv4();
                const imagePath = path.join(
                  `${BASE_PATH}images/`,
                  `${imageId}.jpg`
                );
                await downloadImage(imageUrl.trim(), imagePath);

                const processedImages = await processImage(imagePath, imageId);
                imagePaths.push(processedImages);
              } catch (error) {
                errors.push(
                  `Fila ${
                    index + 1
                  }: Error al descargar la imagen desde la URL '${imageUrl}'`
                );
              }
            }
          }

          try {
            delete inventory.model;
            delete inventory.year;
            delete inventory.brand;
            delete inventory.type;

            const createdInventory = await db.inventory.create({
              data: {
                ...inventory,
                createdById: user.id,
                modelId: model.id,
                enabled: true,
                receptionDate: new Date(inventory.receptionDate),
                images: undefined,
              },
              include: {
                model: {
                  include: {
                    brand: true,
                    type: true,
                  },
                },
              },
            });

            if (imagePaths.length > 0) {
              await db.image.createMany({
                data: imagePaths.map((image) => ({
                  inventoryId: createdInventory.id,
                  url: image.url,
                  type: "image/jpeg",
                  thumbnail: image.thumbnail,
                  enabled: true,
                })),
              });
            }

            successfulInventories.push(createdInventory);
          } catch (error) {
            errors.push(
              `Fila ${index + 1}: Error al crear el inventario: ${
                error.message
              }`
            );
          }
        }

        const getAllInventories = await db.inventory.findMany({
          include: {
            model: {
              include: {
                brand: true,
                type: true,
              },
            },
            conditions: {
              include: {
                condition: true,
              },
            },
            images: true,
            files: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        const responsePayload = {
          message:
            errors.length > 0
              ? "Algunos inventarios no pudieron ser creados"
              : "Inventarios creados exitosamente.",
          createdInventories: successfulInventories,
          data: getAllInventories,
          errors: errors.length > 0 ? errors : null,
        };

        if (errors.length > 0 && successfulInventories.length === 0) {
          return res.status(400).json(responsePayload);
        } else if (errors.length > 0 && successfulInventories.length > 0) {
          return res.status(200).json(responsePayload);
        } else {
          return res.status(200).json(responsePayload);
        }
      });
  } catch (error) {
    console.error("Error al procesar el archivo CSV:", error);
    res.status(500).json({ message: "Error al procesar el archivo CSV." });
  }
};
