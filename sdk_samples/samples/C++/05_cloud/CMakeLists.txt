project(cpp_sample_05_cloud)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 05_cloud.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
