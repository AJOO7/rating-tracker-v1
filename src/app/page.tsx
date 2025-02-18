"use client";
import { useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function Home() {
  const [ratings, setRatings] = useState<
    { x: number; b: number; T: number; rating: number }[]
  >([]);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: { x: number; b: number; T: number }[] =
        XLSX.utils.sheet_to_json(sheet);

      let previousRating = 25.0;
      const computedRatings = jsonData.map(({ x, b, T }) => {
        const rating = calculateFinalScore([[x, b, T]], previousRating);
        previousRating = rating;
        return {
          x,
          b,
          T,
          rating,
        };
      });
      setRatings(computedRatings);
    },
  });

  const chartData = {
    labels: ratings.map((_, index) => `Attempt ${index + 1}`),
    datasets: [
      {
        label: "Rating",
        data: ratings.map((row) => row.rating),
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxRotation: 90,
          minRotation: 90,
          padding: 10,
        },
        grid: {
          display: false,
        },
        title: {
          display: true,
          text: 'Attempts',
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Rating',
        },
      },
    },
    layout: {
      padding: {
        left: 10,
        right: 10,
        top: 10,
        bottom: 10,
      },
    },
  };

  if (!isClient) {
    return null;
  }

  return (
    <div className="container mx-auto p-5">
      <div
        {...getRootProps()}
        className="border-2 border-dashed border-gray-300 p-5 cursor-pointer text-center rounded-lg bg-white shadow-md"
      >
        <input {...getInputProps()} />
        <p className="text-gray-500">
          Drag & drop an Excel file here, or click to select one
        </p>
      </div>
      <div className="mt-5">
        <h2 className="text-2xl font-bold text-center mb-5">Ratings Tracker</h2>
        <div className="mt-5 min-w-[800px] min-h-[600px]">
          <Line data={chartData} options={chartOptions} />
        </div>
        <div className="overflow-x-auto mt-5">
          <table className="w-full border-collapse border border-gray-300 bg-white shadow-md">
            <thead className="bg-gray-100">
              <tr>
                <th className="border py-2 w-1/5">index</th>
                <th className="border py-2 w-1/5">Correctness</th>
                <th className="border py-2 w-1/5">Difficulty</th>
                <th className="border py-2 w-1/5">Time</th>
                <th className="border py-2 w-1/4">Rating</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((row, index) => (
                <tr key={index} className="hover:bg-gray-100">
                  <td className="border py-2  text-gray-500 w-1/5">{index + 1}</td>
                  <td className="border py-2 w-1/5">{row.x}</td>
                  <td className="border py-2 w-1/5">{row.b}</td>
                  <td className="border py-2 w-1/5">{row.T}</td>
                  <td className="border py-2 w-1/4">{row.rating.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function calculateFinalScore(
  itemData: [number, number, number][],
  initialTheta = 25.0,
  sigma = 2.0
) {
  let theta = initialTheta;
  for (const [x, b, T] of itemData) {
    theta = updateTheta(theta, sigma, x, b, T);
  }
  return theta;
}

function updateTheta(
  thetaPrior: number,
  sigma: number,
  x: number,
  b: number,
  T: number
) {
  let theta = thetaPrior;
  let minLoss = negLogPosterior(theta, x, b, T, thetaPrior, sigma);
  // equivalent for optimization(similar graph)
  for (let t = 0; t <= 100; t += 0.1) {
    const loss = negLogPosterior(t, x, b, T, thetaPrior, sigma);
    if (loss < minLoss) {
      minLoss = loss;
      theta = t;
    }
  }

  return theta;
}

function negLogPosterior(
  theta: number,
  x: number,
  b: number,
  T: number,
  thetaPrior: number,
  sigma: number
) {
  let p = probabilityCorrect(theta, b, T);
  p = Math.max(1e-6, Math.min(p, 1 - 1e-6));
  let weight = (b > theta) ? (b - theta) / 20 : 0;

  const negLogLikelihood = -(
    x * (1 + weight) * Math.log(p) +
    (1 - x) * (1 - weight) * Math.log(1 - p)
  );
  const negLogPrior = 1.0 * ((theta - thetaPrior) / sigma) ** 2;
  return negLogLikelihood + negLogPrior;
}

function probabilityCorrect(theta: number, b: number, T: number) {
  const { sEff, c } = getParameters(b, T);
  return c + (1 - c) / (1 + Math.exp(-(theta - b) / sEff));
}

function getParameters(b: number, T: number) {
  const sBase = baseSlope(b);
  const TRefVal = refTime(b);
  const c = guessingFactor(b);
  const sEff = sBase * Math.pow((Math.log(T + 1) / Math.log(TRefVal + 1)), 2);
  return { sEff, c };
}

function baseSlope(b: number) {
  return 6 + 20 * (b / 100.0);
}

function refTime(b: number) {
  const A = -9.48;
  const B = 18.03;
  const C = 0.0392;
  return A + B * Math.exp(C * b);
}

function guessingFactor(b: number) {
  return 0.25 - 0.15 * (b / 100.0);
}